import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as d3 from "d3";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { GraphData, Node, Relationship } from "@shared/schema";

interface GraphVisualizationProps {
  data?: GraphData;
  selectedNode?: any;
  onNodeSelect?: (node: any) => void;
  filters?: {
    entityTypes: string[];
    minImportance: number;
    minConnections: number;
    showDocuments: boolean;
    showConcepts: boolean;
  };
  searchHighlight?: string[];
}

export function GraphVisualization({ 
  data, 
  selectedNode, 
  onNodeSelect, 
  filters,
  searchHighlight 
}: GraphVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [tooltip, setTooltip] = useState<{ node: Node; x: number; y: number } | null>(null);
  const [transform, setTransform] = useState(d3.zoomIdentity);
  const [highlightedSubgraph, setHighlightedSubgraph] = useState<{nodes: string[], relationships: string[]} | null>(null);
  const [filteredData, setFilteredData] = useState<GraphData | null>(null);

  const updatePositionMutation = useMutation({
    mutationFn: async ({ id, x, y }: { id: string; x: number; y: number }) => {
      await apiRequest("PATCH", `/api/nodes/${id}/position`, { x, y });
    },
  });
  
  // Apply filters to data
  useEffect(() => {
    if (!data) {
      setFilteredData(null);
      return;
    }

    let filteredNodes = [...data.nodes];
    let filteredRelationships = [...data.relationships];

    if (filters) {
      // Filter by entity types
      if (filters.entityTypes.length > 0) {
        filteredNodes = filteredNodes.filter(node => 
          filters.entityTypes.includes(node.entityType || '')
        );
      }

      // Filter by importance
      if (filters.minImportance > 0) {
        filteredNodes = filteredNodes.filter(node => 
          (node.importance || 0) >= filters.minImportance
        );
      }

      // Filter by connections
      if (filters.minConnections > 0) {
        filteredNodes = filteredNodes.filter(node => 
          (node.connections || 0) >= filters.minConnections
        );
      }

      // Filter by node types
      if (!filters.showDocuments) {
        filteredNodes = filteredNodes.filter(node => node.type !== 'document');
      }
      if (!filters.showConcepts) {
        filteredNodes = filteredNodes.filter(node => 
          !['concept', 'entity'].includes(node.type)
        );
      }

      // Filter relationships to only include those between visible nodes
      const visibleNodeIds = new Set(filteredNodes.map(n => n.id));
      filteredRelationships = filteredRelationships.filter(rel => 
        visibleNodeIds.has(rel.sourceNodeId) && visibleNodeIds.has(rel.targetNodeId)
      );
    }

    setFilteredData({
      nodes: filteredNodes,
      relationships: filteredRelationships
    });
  }, [data, filters]);

  // Listen for subgraph highlighting events
  useEffect(() => {
    const handleHighlight = (event: any) => {
      const subgraph = event.detail;
      if (subgraph) {
        setHighlightedSubgraph({
          nodes: subgraph.nodes.map((n: any) => n.id),
          relationships: subgraph.relationships.map((r: any) => r.id)
        });
        
        // Auto-clear highlight after 10 seconds
        setTimeout(() => setHighlightedSubgraph(null), 10000);
      }
    };
    
    const handleFocus = (event: any) => {
      const { nodeId } = event.detail;
      if (nodeId && svgRef.current) {
        const svg = d3.select(svgRef.current);
        const node = svg.select(`#node-${nodeId}`);
        if (!node.empty()) {
          const nodeData = node.datum() as any;
          if (nodeData) {
            // Center on the node
            const zoom = d3.zoom<SVGSVGElement, unknown>();
            const centerX = svgRef.current.clientWidth / 2;
            const centerY = svgRef.current.clientHeight / 2;
            const scale = 1.5;
            const x = -nodeData.x * scale + centerX;
            const y = -nodeData.y * scale + centerY;
            
            svg.transition().duration(750).call(
              zoom.transform,
              d3.zoomIdentity.translate(x, y).scale(scale)
            );
          }
        }
      }
    };
    
    window.addEventListener('highlightSubgraph', handleHighlight);
    window.addEventListener('focusNode', handleFocus);
    
    return () => {
      window.removeEventListener('highlightSubgraph', handleHighlight);
      window.removeEventListener('focusNode', handleFocus);
    };
  }, []);

  useEffect(() => {
    const currentData = filteredData || data;
    if (!currentData || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svg.append("g");
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Zoom behavior - only create once
    if (!zoomRef.current) {
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 5])
        .on("zoom", (event) => {
          const { transform } = event;
          container.attr("transform", transform);
          setTransform(transform);
        });
      zoomRef.current = zoom;
    }
    svg.call(zoomRef.current);

    // Process data for D3 - center nodes initially
    const centerX = width / 2;
    const centerY = height / 2;
    const nodes = currentData.nodes.map((node, index) => ({
      ...node,
      x: node.x || centerX + (Math.random() - 0.5) * 200,
      y: node.y || centerY + (Math.random() - 0.5) * 200,
    }));

    const links = currentData.relationships.map(rel => ({
      ...rel,
      source: rel.sourceNodeId,
      target: rel.targetNodeId,
    }));
    

    // Create force simulation with tighter clustering
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(d => {
        // Much shorter distances for tighter clustering
        const strength = d.strength || 0.5;
        return Math.max(30, 80 - (strength * 40));
      }))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(25));


    // Create links FIRST (so they appear behind nodes)
    const link = container.selectAll(".link")
      .data(links)
      .enter().append("line")
      .attr("class", "link")
      .attr("id", d => `link-${d.id}`)
      .attr("stroke", "#FF5630") // Bright coral color  
      .attr("stroke-width", 3) // Thick lines for visibility
      .attr("stroke-opacity", 0.8) // High opacity
      .style("cursor", "pointer");
      
    // Add titles for hover tooltips
    link.append("title").text(d => `${d.relationshipType} (strength: ${d.strength || 0.5})`);

    // Create nodes with different shapes based on type (Neo4j-inspired)
    const nodeContainer = container.selectAll(".node-container")
      .data(nodes)
      .enter().append("g")
      .attr("class", "node-container")
      .attr("id", d => `node-${d.id}`)
      .style("cursor", "pointer")
      .style("opacity", d => {
        // Handle search highlighting
        if (searchHighlight && searchHighlight.length > 0) {
          return searchHighlight.includes(d.id) ? 1 : 0.3;
        }
        // Handle subgraph highlighting
        if (highlightedSubgraph) {
          return highlightedSubgraph.nodes.includes(d.id) ? 1 : 0.3;
        }
        return 1;
      })
      .call(d3.drag<SVGGElement, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
      );

    // Add different shapes for different node types
    nodeContainer.each(function(d) {
      const g = d3.select(this);
      const isHighlighted = highlightedSubgraph?.nodes.includes(d.id) || 
                           (searchHighlight && searchHighlight.includes(d.id));
      const size = Math.sqrt((d.connections || 1)) + 12;
      
      // Neo4j-inspired colors and shapes
      let fill, strokeColor, strokeWidth;
      if (isHighlighted) {
        fill = "#36B37E"; // emerald for highlighted
        strokeColor = "#36B37E";
        strokeWidth = 4;
      } else {
        strokeColor = "white";
        strokeWidth = 2;
        switch (d.type) {
          case 'concept':
            fill = "#00BCD4"; // cyan for concepts
            break;
          case 'document':
            fill = "#FF9800"; // orange for documents
            break;
          case 'url':
            fill = "#4CAF50"; // green for URLs
            break;
          case 'chunk':
            fill = "#9C27B0"; // violet for chunks
            break;
          default:
            fill = "#FF5630"; // coral fallback
        }
      }
      
      // Create shapes based on type
      switch (d.type) {
        case 'concept':
          // Circle for concepts
          g.append("circle")
            .attr("r", size)
            .attr("fill", fill)
            .attr("stroke", strokeColor)
            .attr("stroke-width", strokeWidth);
          break;
          
        case 'document':
          // Rounded rectangle for documents
          g.append("rect")
            .attr("width", size * 1.6)
            .attr("height", size * 1.2)
            .attr("x", -size * 0.8)
            .attr("y", -size * 0.6)
            .attr("rx", 4)
            .attr("ry", 4)
            .attr("fill", fill)
            .attr("stroke", strokeColor)
            .attr("stroke-width", strokeWidth);
          break;
          
        case 'url':
          // Diamond for URLs
          const diamondSize = size * 1.2;
          g.append("polygon")
            .attr("points", `0,-${diamondSize} ${diamondSize},0 0,${diamondSize} -${diamondSize},0`)
            .attr("fill", fill)
            .attr("stroke", strokeColor)
            .attr("stroke-width", strokeWidth);
          break;
          
        case 'chunk':
          // Hexagon for chunks
          const hexSize = size;
          const points = [];
          for (let i = 0; i < 6; i++) {
            const angle = (i * 60) * Math.PI / 180;
            const x = hexSize * Math.cos(angle);
            const y = hexSize * Math.sin(angle);
            points.push(`${x},${y}`);
          }
          g.append("polygon")
            .attr("points", points.join(" "))
            .attr("fill", fill)
            .attr("stroke", strokeColor)
            .attr("stroke-width", strokeWidth);
          break;
          
        default:
          // Default circle
          g.append("circle")
            .attr("r", size)
            .attr("fill", fill)
            .attr("stroke", strokeColor)
            .attr("stroke-width", strokeWidth);
      }
    });
    
    const node = nodeContainer;

    // Create labels with better positioning for different shapes
    const label = container.selectAll(".label")
      .data(nodes)
      .enter().append("text")
      .attr("class", "label")
      .attr("text-anchor", "middle")
      .attr("dy", d => {
        // Adjust label position based on node type
        const size = Math.sqrt((d.connections || 1)) + 12;
        switch (d.type) {
          case 'document': return size * 0.8; // Below rectangle
          case 'url': return size * 1.4; // Below diamond
          case 'chunk': return size * 1.3; // Below hexagon
          default: return size + 15; // Below circle
        }
      })
      .style("font-size", "10px")
      .style("font-weight", "600")
      .style("fill", "#172B4D") // Navy text
      .style("text-shadow", "1px 1px 2px rgba(255,255,255,0.8)")
      .style("pointer-events", "none")
      .text(d => {
        const maxLength = d.type === 'document' ? 12 : 15;
        return d.name.length > maxLength ? d.name.substring(0, maxLength) + "..." : d.name;
      });

    // Node interactions
    node
      .on("mouseover", (event, d) => {
        const [x, y] = d3.pointer(event, document.body);
        setTooltip({ node: d, x, y });
      })
      .on("mouseout", () => {
        setTooltip(null);
      })
      .on("click", (event, d) => {
        onNodeSelect?.(d);
      });

    // Simulation update function
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x || 100)
        .attr("y1", (d: any) => d.source.y || 100)
        .attr("x2", (d: any) => d.target.x || 200)
        .attr("y2", (d: any) => d.target.y || 200);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);

      label
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
      
      // Update position in backend
      updatePositionMutation.mutate({ id: d.id, x: d.x, y: d.y });
    }

    // Apply initial transform
    if (zoomRef.current) {
      svg.call(zoomRef.current.transform, d3.zoomIdentity);
    }

    return () => {
      simulation.stop();
    };
  }, [filteredData, data, transform, highlightedSubgraph, searchHighlight]);

  const handleZoomIn = () => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      svg.transition().duration(300).call(
        zoomRef.current.scaleBy,
        1.5
      );
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      svg.transition().duration(300).call(
        zoomRef.current.scaleBy,
        1 / 1.5
      );
    }
  };

  const handleResetZoom = () => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      svg.transition().duration(500).call(
        zoomRef.current.transform,
        d3.zoomIdentity
      );
    }
  };

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ background: "hsl(var(--card))" }}
      />

      {/* Zoom Controls */}
      <div className="absolute bottom-6 right-6 flex flex-col space-y-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomIn}
          className="bg-card shadow-lg"
        >
          <ZoomIn className="w-5 h-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomOut}
          className="bg-card shadow-lg"
        >
          <ZoomOut className="w-5 h-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleResetZoom}
          className="bg-card shadow-lg"
        >
          <RotateCcw className="w-5 h-5" />
        </Button>
      </div>

      {/* Node Tooltip */}
      {tooltip && (
        <Card
          className="fixed bg-card shadow-lg border border-border p-3 max-w-sm z-50 pointer-events-none"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y - 10,
          }}
        >
          <h4 className="font-medium text-foreground text-sm mb-1">
            {tooltip.node.name}
          </h4>
          {tooltip.node.description && (
            <p className="text-xs text-muted-foreground mb-2">
              {tooltip.node.description}
            </p>
          )}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Connections: {tooltip.node.connections || 0}</span>
            <span>Type: {tooltip.node.type}</span>
          </div>
          {tooltip.node.sourceDocuments && tooltip.node.sourceDocuments.length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              Source: {tooltip.node.sourceDocuments[0]}
            </div>
          )}
        </Card>
      )}

      {/* Empty State */}
      {(!data || data.nodes.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <div className="w-6 h-6 border-2 border-muted-foreground rounded-full"></div>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No Graph Data
            </h3>
            <p className="text-muted-foreground">
              Upload documents to start building your knowledge graph
            </p>
          </div>
        </div>
      )}
      
      {/* Filtered Empty State */}
      {data && data.nodes.length > 0 && filteredData && filteredData.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <div className="w-6 h-6 border-2 border-muted-foreground rounded-full"></div>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No Results
            </h3>
            <p className="text-muted-foreground">
              No nodes match the current filters. Try adjusting your search criteria.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
