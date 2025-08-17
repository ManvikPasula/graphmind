import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Filter, 
  X, 
  Users, 
  Building, 
  MapPin, 
  Tag, 
  FileText, 
  Calendar,
  Star,
  Settings
} from "lucide-react";
import type { Node } from "@shared/schema";

interface GraphFiltersProps {
  onFilterChange: (filters: GraphFilters) => void;
  onSearchResults: (nodes: Node[]) => void;
  onClose?: () => void;
  isCollapsed?: boolean;
}

export interface GraphFilters {
  search: string;
  entityTypes: string[];
  minImportance: number;
  minConnections: number;
  showDocuments: boolean;
  showConcepts: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

const defaultFilters: GraphFilters = {
  search: '',
  entityTypes: [],
  minImportance: 0,
  minConnections: 0,
  showDocuments: true,
  showConcepts: true,
};

const entityTypeConfig = [
  { type: 'person', label: 'People', icon: Users, color: 'bg-blue-100 text-blue-800' },
  { type: 'organization', label: 'Organizations', icon: Building, color: 'bg-green-100 text-green-800' },
  { type: 'location', label: 'Locations', icon: MapPin, color: 'bg-purple-100 text-purple-800' },
  { type: 'technology', label: 'Technology', icon: Settings, color: 'bg-orange-100 text-orange-800' },
  { type: 'concept', label: 'Concepts', icon: Tag, color: 'bg-gray-100 text-gray-800' },
  { type: 'date', label: 'Dates', icon: Calendar, color: 'bg-yellow-100 text-yellow-800' },
];

export function GraphFilters({ 
  onFilterChange, 
  onSearchResults, 
  onClose,
  isCollapsed = false 
}: GraphFiltersProps) {
  const [filters, setFilters] = useState<GraphFilters>(defaultFilters);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search nodes
  const { data: searchResults } = useQuery<Node[]>({
    queryKey: ['/api/nodes/search', debouncedSearch],
    enabled: debouncedSearch.length >= 2,
    staleTime: 30000,
  });

  // Get graph statistics
  const { data: graphStats } = useQuery<{
    totalNodes: number;
    totalRelationships: number;
    totalDocuments: number;
    entityTypes: Record<string, number>;
    relationshipTypes: Record<string, number>;
    avgConnections: number;
  }>({
    queryKey: ['/api/graph/stats'],
    staleTime: 60000,
  });

  // Update filters when any filter changes
  useEffect(() => {
    const newFilters = {
      ...filters,
      search: debouncedSearch,
    };
    onFilterChange(newFilters);
  }, [filters, debouncedSearch, onFilterChange]);

  // Update search results
  useEffect(() => {
    if (searchResults) {
      onSearchResults(searchResults);
    }
  }, [searchResults, onSearchResults]);

  const handleEntityTypeChange = (entityType: string, checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      entityTypes: checked
        ? [...prev.entityTypes, entityType]
        : prev.entityTypes.filter(t => t !== entityType)
    }));
  };

  const clearAllFilters = () => {
    setFilters(defaultFilters);
    setSearchQuery('');
    setDebouncedSearch('');
  };

  const activeFilterCount = 
    filters.entityTypes.length + 
    (filters.minImportance > 0 ? 1 : 0) + 
    (filters.minConnections > 0 ? 1 : 0) +
    (!filters.showDocuments ? 1 : 0) +
    (!filters.showConcepts ? 1 : 0);

  if (isCollapsed) {
    return (
      <Card className="w-12 h-fit">
        <CardContent className="p-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 relative"
          >
            <Filter className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-1 -right-1 w-5 h-5 p-0 text-xs"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-80 h-fit">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFilterCount}
              </Badge>
            )}
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Search Nodes</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {searchResults && searchResults.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Found {searchResults.length} result(s)
            </div>
          )}
        </div>

        <Separator />

        {/* Entity Types */}
        <div className="space-y-3">
          <Label>Entity Types</Label>
          <div className="grid grid-cols-2 gap-2">
            {entityTypeConfig.map(({ type, label, icon: Icon, color }) => (
              <div key={type} className="flex items-center space-x-2">
                <Checkbox
                  id={type}
                  checked={filters.entityTypes.includes(type)}
                  onCheckedChange={(checked) => 
                    handleEntityTypeChange(type, checked as boolean)
                  }
                />
                <Label
                  htmlFor={type}
                  className="flex items-center space-x-1 text-sm cursor-pointer"
                >
                  <Icon className="w-3 h-3" />
                  <span>{label}</span>
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Node Types */}
        <div className="space-y-3">
          <Label>Node Types</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showDocuments"
                checked={filters.showDocuments}
                onCheckedChange={(checked) => 
                  setFilters(prev => ({ ...prev, showDocuments: checked as boolean }))
                }
              />
              <Label htmlFor="showDocuments" className="flex items-center space-x-1 text-sm">
                <FileText className="w-3 h-3" />
                <span>Documents</span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showConcepts"
                checked={filters.showConcepts}
                onCheckedChange={(checked) => 
                  setFilters(prev => ({ ...prev, showConcepts: checked as boolean }))
                }
              />
              <Label htmlFor="showConcepts" className="flex items-center space-x-1 text-sm">
                <Tag className="w-3 h-3" />
                <span>Concepts & Entities</span>
              </Label>
            </div>
          </div>
        </div>

        <Separator />

        {/* Importance Filter */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Minimum Importance</Label>
            <span className="text-sm text-muted-foreground">
              {Math.round(filters.minImportance * 100)}%
            </span>
          </div>
          <Slider
            value={[filters.minImportance]}
            onValueChange={([value]) => 
              setFilters(prev => ({ ...prev, minImportance: value }))
            }
            max={1}
            min={0}
            step={0.1}
            className="w-full"
          />
          <div className="flex items-center text-xs text-muted-foreground">
            <Star className="w-3 h-3 mr-1" />
            Higher importance = more mentions and connections
          </div>
        </div>

        <Separator />

        {/* Connections Filter */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Minimum Connections</Label>
            <span className="text-sm text-muted-foreground">
              {filters.minConnections}
            </span>
          </div>
          <Slider
            value={[filters.minConnections]}
            onValueChange={([value]) => 
              setFilters(prev => ({ ...prev, minConnections: value }))
            }
            max={20}
            min={0}
            step={1}
            className="w-full"
          />
        </div>

        <Separator />

        {/* Graph Statistics */}
        {graphStats && (
          <div className="space-y-2">
            <Label>Graph Statistics</Label>
            <div className="text-sm space-y-1 text-muted-foreground">
              <div>Total Nodes: {graphStats?.totalNodes || 0}</div>
              <div>Total Relationships: {graphStats?.totalRelationships || 0}</div>
              <div>Documents: {graphStats?.totalDocuments || 0}</div>
            </div>
          </div>
        )}

        {/* Clear Filters */}
        {activeFilterCount > 0 && (
          <>
            <Separator />
            <Button
              variant="outline"
              onClick={clearAllFilters}
              className="w-full"
            >
              <X className="w-4 h-4 mr-2" />
              Clear All Filters
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}