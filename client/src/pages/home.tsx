import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraphVisualization } from "@/components/graph-visualization";
import { Sidebar } from "@/components/sidebar";
import { SearchBar } from "@/components/search-bar";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import type { GraphData } from "@shared/schema";

export default function Home() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);

  const { data: graphData, isLoading } = useQuery<GraphData>({
    queryKey: ["/api/graph"],
    refetchInterval: 5000, // Refresh every 5 seconds to get new processed documents
  });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className={`transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-0' : 'w-80'}`}>
        <Sidebar 
          collapsed={sidebarCollapsed} 
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          graphData={graphData}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 relative">
        {/* Toggle Sidebar Button (when collapsed) */}
        {sidebarCollapsed && (
          <Button
            variant="outline"
            size="icon"
            className="absolute top-4 left-4 z-20"
            onClick={() => setSidebarCollapsed(false)}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Search Bar */}
        <div className="absolute top-6 left-6 right-6 z-10">
          <div className={`max-w-2xl mx-auto ${sidebarCollapsed ? '' : 'ml-0'}`}>
            <SearchBar />
          </div>
        </div>

        {/* Graph Visualization */}
        <div className="w-full h-full graph-container">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
                <p className="text-sm text-foreground font-medium">Loading graph...</p>
              </div>
            </div>
          ) : (
            <GraphVisualization 
              data={graphData} 
              selectedNode={selectedNode}
              onNodeSelect={setSelectedNode}
            />
          )}
        </div>

        {/* Graph Stats */}
        <div className="absolute bottom-6 left-6 bg-card shadow-lg rounded-lg border border-border px-4 py-2">
          <div className="flex space-x-4 text-sm">
            <span className="text-muted-foreground">
              Nodes: <span className="font-medium text-foreground">{graphData?.nodes?.length || 0}</span>
            </span>
            <span className="text-muted-foreground">
              Edges: <span className="font-medium text-foreground">{graphData?.relationships?.length || 0}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
