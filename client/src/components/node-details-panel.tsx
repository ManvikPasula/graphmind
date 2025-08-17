import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  X, 
  Network, 
  FileText, 
  Tag, 
  Users, 
  MapPin, 
  Building, 
  Calendar,
  Star,
  ExternalLink,
  Quote
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Node, Relationship } from "@shared/schema";

interface NodeDetailsPanelProps {
  node: Node | null;
  onClose: () => void;
  onHighlightNeighborhood: (nodeId: string, hops: number) => void;
  onFocusNode: (nodeId: string) => void;
}

interface NodeNeighborhood {
  nodes: Node[];
  relationships: Relationship[];
}

export function NodeDetailsPanel({ 
  node, 
  onClose, 
  onHighlightNeighborhood, 
  onFocusNode 
}: NodeDetailsPanelProps) {
  const queryClient = useQueryClient();
  const [selectedHops, setSelectedHops] = useState(1);

  // Fetch neighborhood data
  const { data: neighborhood } = useQuery<NodeNeighborhood>({
    queryKey: ['/api/graph/neighborhood', node?.id, selectedHops],
    enabled: !!node?.id,
    staleTime: 30000,
  });

  const highlightNeighborhoodMutation = useMutation({
    mutationFn: async (hops: number) => {
      if (!node) return;
      onHighlightNeighborhood(node.id, hops);
    },
  });

  if (!node) return null;

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'person': return <Users className="w-4 h-4" />;
      case 'organization': return <Building className="w-4 h-4" />;
      case 'location': return <MapPin className="w-4 h-4" />;
      case 'date': return <Calendar className="w-4 h-4" />;
      case 'concept': return <Tag className="w-4 h-4" />;
      case 'document': return <FileText className="w-4 h-4" />;
      default: return <Network className="w-4 h-4" />;
    }
  };

  const getEntityColor = (entityType: string) => {
    switch (entityType) {
      case 'person': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'organization': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'location': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'technology': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'date': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'concept': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      case 'document': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const formatImportance = (importance: number | null) => {
    if (!importance) return 'Low';
    if (importance >= 0.8) return 'Very High';
    if (importance >= 0.6) return 'High';
    if (importance >= 0.4) return 'Medium';
    return 'Low';
  };

  const formatConfidence = (confidence: number | null) => {
    if (!confidence) return 'Unknown';
    return `${Math.round(confidence * 100)}%`;
  };

  return (
    <Card className="w-96 h-full flex flex-col shadow-lg border-l">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            {getEntityIcon(node.entityType || 'concept')}
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg truncate" title={node.name}>
                {node.name}
              </CardTitle>
              {node.entityType && (
                <Badge 
                  variant="secondary" 
                  className={`mt-1 ${getEntityColor(node.entityType)}`}
                >
                  {node.entityType}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        {node.aliases && node.aliases.length > 1 && (
          <div className="text-sm text-muted-foreground">
            Also known as: {node.aliases.filter(alias => alias !== node.name).slice(0, 3).join(', ')}
            {node.aliases.length > 4 && ' ...'}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="connections">
              Connections ({node.connections || 0})
            </TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-4">
            <TabsContent value="overview" className="h-full">
              <ScrollArea className="h-full">
                <div className="space-y-4">
                  {/* Description */}
                  {node.description && (
                    <div>
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {node.description}
                      </p>
                    </div>
                  )}

                  {/* Summary */}
                  {node.summary && (
                    <div>
                      <h4 className="font-medium mb-2">Summary</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {node.summary}
                      </p>
                    </div>
                  )}

                  <Separator />

                  {/* Statistics */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Mentions</div>
                      <div className="text-muted-foreground">{node.mentions || 1}</div>
                    </div>
                    <div>
                      <div className="font-medium">Connections</div>
                      <div className="text-muted-foreground">{node.connections || 0}</div>
                    </div>
                    <div>
                      <div className="font-medium">Importance</div>
                      <div className="text-muted-foreground flex items-center">
                        <Star className="w-3 h-3 mr-1" />
                        {formatImportance(node.importance)}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">Confidence</div>
                      <div className="text-muted-foreground">
                        {formatConfidence(node.confidence)}
                      </div>
                    </div>
                  </div>

                  {/* Properties */}
                  {node.properties && Object.keys(node.properties).length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium mb-2">Properties</h4>
                        <div className="space-y-2 text-sm">
                          {Object.entries(node.properties).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="font-medium capitalize">{key}:</span>
                              <span className="text-muted-foreground truncate ml-2">
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Actions */}
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium">Actions</h4>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onFocusNode(node.id)}
                      >
                        <Network className="w-3 h-3 mr-1" />
                        Focus
                      </Button>
                      
                      <div className="flex items-center space-x-1">
                        <select
                          value={selectedHops}
                          onChange={(e) => setSelectedHops(Number(e.target.value))}
                          className="text-xs border rounded px-1 py-0.5"
                        >
                          <option value={1}>1 hop</option>
                          <option value={2}>2 hops</option>
                          <option value={3}>3 hops</option>
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => highlightNeighborhoodMutation.mutate(selectedHops)}
                          disabled={highlightNeighborhoodMutation.isPending}
                        >
                          Highlight
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="connections" className="h-full">
              <ScrollArea className="h-full">
                <div className="space-y-3">
                  {neighborhood?.relationships.map((rel) => {
                    const otherNodeId = rel.sourceNodeId === node.id ? rel.targetNodeId : rel.sourceNodeId;
                    const otherNode = neighborhood.nodes.find(n => n.id === otherNodeId);
                    
                    if (!otherNode) return null;

                    return (
                      <Card key={rel.id} className="p-3 cursor-pointer hover:bg-muted/50"
                            onClick={() => onFocusNode(otherNode.id)}>
                        <div className="flex items-start space-x-2">
                          {getEntityIcon(otherNode.entityType || 'concept')}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {otherNode.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {rel.relationshipType.replace(/_/g, ' ').toLowerCase()}
                            </div>
                            {rel.context && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                <Quote className="w-3 h-3 inline mr-1" />
                                {rel.context}
                              </div>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {Math.round((rel.confidence || 0.5) * 100)}%
                          </Badge>
                        </div>
                      </Card>
                    );
                  })}
                  
                  {(!neighborhood?.relationships || neighborhood.relationships.length === 0) && (
                    <div className="text-center text-muted-foreground py-8">
                      <Network className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No connections found</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="sources" className="h-full">
              <ScrollArea className="h-full">
                <div className="space-y-3">
                  {node.sourceDocuments?.map((source, index) => (
                    <Card key={index} className="p-3">
                      <div className="flex items-start space-x-2">
                        <FileText className="w-4 h-4 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" title={source}>
                            {source}
                          </div>
                          {source.startsWith('http') && (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() => window.open(source, '_blank')}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Open link
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}

                  {node.sourceChunks && node.sourceChunks.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium mb-2 text-sm">Text Chunks</h4>
                        <div className="text-xs text-muted-foreground">
                          Referenced in {node.sourceChunks.length} text chunk(s)
                        </div>
                      </div>
                    </>
                  )}

                  {(!node.sourceDocuments || node.sourceDocuments.length === 0) && (
                    <div className="text-center text-muted-foreground py-8">
                      <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No source documents</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}