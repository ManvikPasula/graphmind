import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { QueryResult } from "@shared/schema";

interface EnhancedQueryResult extends QueryResult {
  relationships?: any[];
  subgraph?: {
    nodes: any[];
    relationships: any[];
  };
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EnhancedQueryResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const { toast } = useToast();

  const queryMutation = useMutation({
    mutationFn: async (question: string) => {
      const response = await apiRequest("POST", "/api/query", { question });
      return response.json() as Promise<EnhancedQueryResult>;
    },
    onSuccess: (data) => {
      setResults(data);
      setShowResults(true);
      
      // Emit event for graph highlighting
      if (data.subgraph) {
        window.dispatchEvent(new CustomEvent('highlightSubgraph', {
          detail: data.subgraph
        }));
      }
    },
    onError: () => {
      toast({
        title: "Query failed",
        description: "Failed to process your question",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      queryMutation.mutate(query.trim());
    }
  };

  const handleCloseResults = () => {
    setShowResults(false);
    setResults(null);
  };

  return (
    <>
      {/* Search Bar */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <Input
            type="text"
            placeholder="Ask questions about your knowledge graph..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-20 py-3 bg-card/95 backdrop-blur-sm shadow-lg border-border focus:ring-2 focus:ring-primary focus:border-primary"
          />
          <Button
            type="submit"
            size="sm"
            disabled={queryMutation.isPending || !query.trim()}
            className="absolute inset-y-0 right-0 flex items-center pr-3 bg-primary hover:bg-primary/90"
          >
            {queryMutation.isPending ? (
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Ask"
            )}
          </Button>
        </div>
      </form>

      {/* Query Results */}
      {showResults && results && (
        <Card className="absolute top-full mt-4 left-0 right-0 max-h-60 bg-card shadow-lg border border-border overflow-hidden z-50">
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h3 className="text-sm font-medium text-foreground">Query Results</h3>
            <Button variant="ghost" size="icon" onClick={handleCloseResults}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="p-4 max-h-48 overflow-y-auto">
            <div className="mb-3 p-3 bg-muted rounded-lg">
              <p className="text-sm text-foreground font-medium mb-2">{results.answer}</p>
              {results.relevantNodes && results.relevantNodes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Highlighted concepts:</p>
                  <div className="flex flex-wrap gap-1">
                    {results.relevantNodes.map((node) => (
                      <span
                        key={node.id}
                        className="inline-block px-2 py-1 text-xs bg-secondary/10 text-secondary rounded-full cursor-pointer hover:bg-secondary/20"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('focusNode', {
                            detail: { nodeId: node.id }
                          }));
                        }}
                      >
                        {node.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {results.relationships && results.relationships.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1">Key relationships ({results.relationships.length}):</p>
                  <div className="text-xs bg-muted/50 rounded p-2 max-h-16 overflow-y-auto">
                    {results.relationships.slice(0, 3).map((rel, idx) => {
                      const sourceName = results.relevantNodes?.find(n => n.id === rel.sourceNodeId)?.name || 'Unknown';
                      const targetName = results.relevantNodes?.find(n => n.id === rel.targetNodeId)?.name || 'Unknown';
                      return (
                        <div key={idx} className="text-muted-foreground">
                          {sourceName} → <span className="text-primary">{rel.relationshipType}</span> → {targetName}
                        </div>
                      );
                    })}
                    {results.relationships.length > 3 && (
                      <div className="text-muted-foreground italic">...and {results.relationships.length - 3} more</div>
                    )}
                  </div>
                </div>
              )}
              {results.cypherQuery && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer">Show Cypher Query</summary>
                  <code className="text-xs font-mono bg-background p-2 rounded mt-1 block">
                    {results.cypherQuery}
                  </code>
                </details>
              )}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
