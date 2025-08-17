import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileUpload } from "./file-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { PanelLeftClose, Download, Trash2, Plus, FileText, Globe, CheckCircle, XCircle, Clock, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Document, GraphData } from "@shared/schema";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  graphData?: GraphData;
}

export function Sidebar({ collapsed, onToggle, graphData }: SidebarProps) {
  const [url, setUrl] = useState("");
  const [nodeSize, setNodeSize] = useState(10);
  const [edgeThickness, setEdgeThickness] = useState(2);
  const [layoutAlgorithm, setLayoutAlgorithm] = useState("force-directed");
  const { toast } = useToast();

  const { data: documents } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const addUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/documents/url", { url });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph"] });
      setUrl("");
      toast({
        title: "URL added successfully",
        description: "Content is being processed...",
      });
    },
    onError: (error: any) => {
      let title = "Error adding URL";
      let description = "Failed to fetch URL content";
      
      if (error.message?.includes('409')) {
        title = "Duplicate content";
        description = "This URL content already exists in your knowledge graph";
      } else if (error.message?.includes('400')) {
        title = "Invalid URL";
        description = "URL not accessible or content too large/small";
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  const clearGraphMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/graph");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/graph"] });
      toast({
        title: "Graph cleared",
        description: "All nodes and relationships have been removed",
      });
    },
    onError: () => {
      toast({
        title: "Error clearing graph",
        description: "Failed to clear the graph",
        variant: "destructive",
      });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiRequest("DELETE", `/api/documents/${documentId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph"] });
      toast({
        title: "Document deleted",
        description: "Document and related graph data removed",
      });
    },
    onError: () => {
      toast({
        title: "Error deleting document",
        description: "Failed to delete the document",
        variant: "destructive",
      });
    },
  });

  const exportGraphMutation = useMutation({
    mutationFn: async (format: string) => {
      const response = await fetch(`/api/export?format=${format}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      const extensions = { json: 'json', graphml: 'graphml', csv: 'csv' };
      const extension = extensions[format as keyof typeof extensions] || 'json';
      a.download = `knowledge-graph.${extension}`;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: (_, format) => {
      toast({
        title: "Graph exported",
        description: `Graph exported as ${format.toUpperCase()} format`,
      });
    },
  });
  
  const exportGraph = (format: string) => {
    exportGraphMutation.mutate(format);
  };

  const handleAddUrl = () => {
    if (url.trim()) {
      addUrlMutation.mutate(url.trim());
    }
  };

  const totalSize = documents?.reduce((sum, doc) => sum + doc.size, 0) || 0;
  const maxSize = 100 * 1024 * 1024; // 100MB
  const usagePercentage = (totalSize / maxSize) * 100;

  if (collapsed) return null;

  return (
    <div className="w-80 bg-card shadow-lg border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-foreground font-inter">
            Knowledge Graph Builder
          </h1>
          <Button variant="ghost" size="icon" onClick={onToggle}>
            <PanelLeftClose className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="flex items-center space-x-2 text-sm">
          <div className="w-2 h-2 bg-secondary rounded-full"></div>
          <span className="text-muted-foreground">Ready to build graph</span>
        </div>
      </div>

      {/* Documents List */}
      {documents && documents.length > 0 && (
        <div className="p-6 border-b border-border">
          <h3 className="text-sm font-medium text-foreground mb-3">Documents ({documents.length})</h3>
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {documents.map((doc) => {
              const isUrl = doc.filename.startsWith('http');
              const displayName = isUrl 
                ? new URL(doc.filename).hostname + new URL(doc.filename).pathname.slice(0, 20) + '...'
                : doc.filename.length > 25 
                  ? doc.filename.slice(0, 25) + '...'
                  : doc.filename;
              
              const getStatusInfo = () => {
                switch (doc.processed) {
                  case 0: return { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-900/20", progress: 50, status: "Processing..." };
                  case 1: return { icon: CheckCircle, color: "text-green-500", bg: "bg-green-50 dark:bg-green-900/20", progress: 100, status: "Completed" };
                  case 2: return { icon: XCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20", progress: 0, status: "Error" };
                  case 3: return { icon: CheckCircle, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", progress: 100, status: "Duplicate" };
                  default: return { icon: Clock, color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-900/20", progress: 0, status: "Pending" };
                }
              };

              const statusInfo = getStatusInfo();
              const StatusIcon = statusInfo.icon;

              return (
                <div key={doc.id} className={`p-3 rounded-lg ${statusInfo.bg} border border-border/50`}>
                  <div className="flex items-start space-x-2">
                    <div className="flex-shrink-0 mt-0.5">
                      {isUrl ? (
                        <Globe className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-foreground truncate" title={doc.filename}>
                          {displayName}
                        </p>
                        <div className="flex items-center space-x-1">
                          <StatusIcon className={`w-3 h-3 ${statusInfo.color}`} />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDocumentMutation.mutate(doc.id);
                            }}
                            disabled={deleteDocumentMutation.isPending}
                            className="h-4 w-4 p-0 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {(doc.size / 1024).toFixed(1)} KB • {statusInfo.status}
                      </p>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            doc.processed === 1 ? 'bg-green-500' :
                            doc.processed === 2 ? 'bg-red-500' :
                            doc.processed === 3 ? 'bg-blue-500' : 'bg-yellow-500'
                          }`}
                          style={{ width: `${statusInfo.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* File Upload Section */}
      <div className="p-6 border-b border-border">
        <h3 className="text-sm font-medium text-foreground mb-3">Data Sources</h3>
        
        <FileUpload />

        {/* URL Input */}
        <div className="mt-4">
          <Label htmlFor="url" className="text-sm font-medium">Add URL</Label>
          <div className="flex space-x-2 mt-2">
            <Input
              id="url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={handleAddUrl}
              disabled={addUrlMutation.isPending || !url.trim()}
              size="sm"
            >
              {addUrlMutation.isPending ? (
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Storage Usage */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Storage Used</span>
            <span>{(totalSize / (1024 * 1024)).toFixed(1)} MB / 100 MB</span>
          </div>
          <Progress value={usagePercentage} className="h-1.5" />
        </div>
      </div>

      {/* Graph Controls */}
      <div className="p-6 border-b border-border flex-1">
        <h3 className="text-sm font-medium text-foreground mb-3">Graph Controls</h3>
        
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium">Layout Algorithm</Label>
            <Select value={layoutAlgorithm} onValueChange={setLayoutAlgorithm}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="force-directed">Force-directed</SelectItem>
                <SelectItem value="hierarchical">Hierarchical</SelectItem>
                <SelectItem value="circular">Circular</SelectItem>
                <SelectItem value="grid">Grid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label className="text-xs font-medium">Node Size: {nodeSize}</Label>
            <input
              type="range"
              min="5"
              max="20"
              value={nodeSize}
              onChange={(e) => setNodeSize(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer slider mt-1"
            />
          </div>
          
          <div>
            <Label className="text-xs font-medium">Edge Thickness: {edgeThickness}</Label>
            <input
              type="range"
              min="1"
              max="5"
              value={edgeThickness}
              onChange={(e) => setEdgeThickness(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer slider mt-1"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6">
          <h4 className="text-xs font-medium text-foreground mb-2">Filters</h4>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox id="entities" defaultChecked />
              <Label htmlFor="entities" className="text-sm">Show entities</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="relationships" defaultChecked />
              <Label htmlFor="relationships" className="text-sm">Show relationships</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="clusters" />
              <Label htmlFor="clusters" className="text-sm">Show clusters</Label>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6">
          <h4 className="text-xs font-medium text-foreground mb-2">Legend</h4>
          <div className="space-y-2">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-nodes rounded-full mr-2"></div>
              <span className="text-xs text-muted-foreground">Concepts</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-1 bg-edges mr-2"></div>
              <span className="text-xs text-muted-foreground">Relationships</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-secondary rounded-full mr-2"></div>
              <span className="text-xs text-muted-foreground">Entities</span>
            </div>
          </div>
        </div>
      </div>

      {/* Export Actions */}
      <div className="p-6">
        <div className="space-y-2 mb-2">
          <Label className="text-xs font-medium">Export Format</Label>
          <div className="grid grid-cols-3 gap-1">
            <Button 
              variant="outline"
              size="sm"
              onClick={() => exportGraph('json')}
              disabled={exportGraphMutation.isPending}
              className="text-xs"
            >
              JSON
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => exportGraph('graphml')}
              disabled={exportGraphMutation.isPending}
              className="text-xs"
            >
              GraphML
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => exportGraph('csv')}
              disabled={exportGraphMutation.isPending}
              className="text-xs"
            >
              CSV
            </Button>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={() => clearGraphMutation.mutate()}
          disabled={clearGraphMutation.isPending}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear Graph
        </Button>
      </div>
    </div>
  );
}
