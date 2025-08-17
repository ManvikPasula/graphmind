import { type Document, type InsertDocument, type Chunk, type InsertChunk, type Node, type InsertNode, type Relationship, type InsertRelationship, type Query, type InsertQuery, type GraphData } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Documents
  createDocument(document: InsertDocument): Promise<Document>;
  getDocuments(): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  getDocumentByHash(hash: string): Promise<Document | undefined>;
  updateDocumentProcessed(id: string, processed: number): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  
  // Chunks
  createChunk(chunk: InsertChunk): Promise<Chunk>;
  getChunks(): Promise<Chunk[]>;
  getChunksByDocument(documentId: string): Promise<Chunk[]>;
  getChunk(id: string): Promise<Chunk | undefined>;
  deleteChunksByDocument(documentId: string): Promise<void>;
  
  // Nodes
  createNode(node: InsertNode): Promise<Node>;
  getNodes(): Promise<Node[]>;
  getNode(id: string): Promise<Node | undefined>;
  getNodeByName(name: string): Promise<Node | undefined>;
  getNodesByType(type: string): Promise<Node[]>;
  getNodesByEntityType(entityType: string): Promise<Node[]>;
  updateNodePosition(id: string, x: number, y: number): Promise<void>;
  updateNodeConnections(id: string, connections: number): Promise<void>;
  updateNodeImportance(id: string, importance: number): Promise<void>;
  deleteAllNodes(): Promise<void>;
  
  // Relationships
  createRelationship(relationship: InsertRelationship): Promise<Relationship>;
  getRelationships(): Promise<Relationship[]>;
  getRelationshipsByNode(nodeId: string): Promise<Relationship[]>;
  getRelationshipsByType(relationshipType: string): Promise<Relationship[]>;
  deleteAllRelationships(): Promise<void>;
  
  // Queries
  createQuery(query: InsertQuery): Promise<Query>;
  getQueries(): Promise<Query[]>;
  
  // Graph operations
  getGraphData(): Promise<GraphData>;
  getNeighborhood(nodeId: string, hops?: number): Promise<GraphData>;
  searchNodes(query: string): Promise<Node[]>;
  getNodesByImportance(minImportance: number): Promise<Node[]>;
  clearGraph(): Promise<void>;
}

export class MemStorage implements IStorage {
  private documents: Map<string, Document> = new Map();
  private chunks: Map<string, Chunk> = new Map();
  private nodes: Map<string, Node> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private queries: Map<string, Query> = new Map();

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const id = randomUUID();
    const document: Document = {
      id,
      filename: insertDocument.filename,
      content: insertDocument.content,
      size: insertDocument.size,
      contentType: insertDocument.contentType || null,
      language: insertDocument.language || null,
      wordCount: insertDocument.wordCount || null,
      hash: insertDocument.hash || null,
      uploadedAt: new Date(),
      processed: 0
    };
    this.documents.set(id, document);
    return document;
  }

  async getDocuments(): Promise<Document[]> {
    return Array.from(this.documents.values());
  }

  async getDocument(id: string): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async getDocumentByHash(hash: string): Promise<Document | undefined> {
    return Array.from(this.documents.values()).find(doc => doc.hash === hash);
  }

  async updateDocumentProcessed(id: string, processed: number): Promise<void> {
    const document = this.documents.get(id);
    if (document) {
      document.processed = processed;
      this.documents.set(id, document);
    }
  }

  async deleteDocument(id: string): Promise<void> {
    const document = this.documents.get(id);
    if (document) {
      // Remove the document
      this.documents.delete(id);
      
      // Delete associated chunks
      await this.deleteChunksByDocument(id);
      
      // Clean up nodes that only belong to this document
      const nodesToDelete: string[] = [];
      for (const [nodeId, node] of Array.from(this.nodes)) {
        if (node.sourceDocuments && node.sourceDocuments.includes(document.filename)) {
          // Remove this document from the node's source documents
          node.sourceDocuments = node.sourceDocuments.filter((doc: string) => doc !== document.filename);
          
          // If no source documents left, mark for deletion
          if (node.sourceDocuments.length === 0) {
            nodesToDelete.push(nodeId);
          } else {
            node.updatedAt = new Date();
            this.nodes.set(nodeId, node);
          }
        }
      }
      
      // Delete orphaned nodes and their relationships
      for (const nodeId of nodesToDelete) {
        this.nodes.delete(nodeId);
        
        // Delete relationships involving this node
        const relationshipsToDelete: string[] = [];
        for (const [relId, rel] of Array.from(this.relationships)) {
          if (rel.sourceNodeId === nodeId || rel.targetNodeId === nodeId) {
            relationshipsToDelete.push(relId);
          }
        }
        
        for (const relId of relationshipsToDelete) {
          this.relationships.delete(relId);
        }
      }
    }
  }

  async createNode(insertNode: InsertNode): Promise<Node> {
    const id = randomUUID();
    const now = new Date();
    const node: Node = {
      id,
      name: insertNode.name,
      type: insertNode.type,
      entityType: insertNode.entityType || null,
      label: insertNode.label || null,
      canonical: insertNode.canonical || null,
      aliases: insertNode.aliases || [],
      confidence: insertNode.confidence || 1.0,
      description: insertNode.description || null,
      summary: insertNode.summary || null,
      properties: insertNode.properties || null,
      x: insertNode.x || null,
      y: insertNode.y || null,
      connections: insertNode.connections || 0,
      sourceDocuments: insertNode.sourceDocuments || [],
      sourceChunks: insertNode.sourceChunks || [],
      mentions: insertNode.mentions || 1,
      importance: insertNode.importance || 0.5,
      source: null,
      size: null,
      fetchedAt: null,
      documentId: insertNode.documentId || null,
      chunkId: insertNode.chunkId || null,
      startIndex: insertNode.startIndex || null,
      endIndex: insertNode.endIndex || null,
      createdAt: now,
      updatedAt: now
    };
    this.nodes.set(id, node);
    return node;
  }

  async getNodes(): Promise<Node[]> {
    return Array.from(this.nodes.values());
  }

  async getNode(id: string): Promise<Node | undefined> {
    return this.nodes.get(id);
  }

  async getNodeByName(name: string): Promise<Node | undefined> {
    return Array.from(this.nodes.values()).find(node => node.name === name);
  }

  async updateNodePosition(id: string, x: number, y: number): Promise<void> {
    const node = this.nodes.get(id);
    if (node) {
      node.x = x;
      node.y = y;
      this.nodes.set(id, node);
    }
  }

  async updateNodeConnections(id: string, connections: number): Promise<void> {
    const node = this.nodes.get(id);
    if (node) {
      node.connections = connections;
      node.updatedAt = new Date();
      this.nodes.set(id, node);
    }
  }

  async updateNodeImportance(id: string, importance: number): Promise<void> {
    const node = this.nodes.get(id);
    if (node) {
      node.importance = importance;
      node.updatedAt = new Date();
      this.nodes.set(id, node);
    }
  }

  async getNodesByType(type: string): Promise<Node[]> {
    return Array.from(this.nodes.values()).filter(node => node.type === type);
  }

  async getNodesByEntityType(entityType: string): Promise<Node[]> {
    return Array.from(this.nodes.values()).filter(node => node.entityType === entityType);
  }

  async deleteAllNodes(): Promise<void> {
    this.nodes.clear();
  }

  async createRelationship(insertRelationship: InsertRelationship): Promise<Relationship> {
    const id = randomUUID();
    const relationship: Relationship = {
      id,
      sourceNodeId: insertRelationship.sourceNodeId,
      targetNodeId: insertRelationship.targetNodeId,
      relationshipType: insertRelationship.relationshipType,
      label: insertRelationship.label || null,
      direction: insertRelationship.direction || 'undirected',
      strength: insertRelationship.strength || 1.0,
      weight: insertRelationship.weight || 1.0,
      confidence: insertRelationship.confidence || 0.5,
      count: insertRelationship.count || 1,
      distance: insertRelationship.distance || 1,
      context: insertRelationship.context || null,
      sourceChunks: insertRelationship.sourceChunks || [],
      sourceDocuments: insertRelationship.sourceDocuments || [],
      extractedAt: new Date(),
      properties: insertRelationship.properties || null
    };
    this.relationships.set(id, relationship);
    
    // Update connection counts
    const sourceNode = this.nodes.get(insertRelationship.sourceNodeId);
    const targetNode = this.nodes.get(insertRelationship.targetNodeId);
    if (sourceNode) {
      sourceNode.connections = (sourceNode.connections || 0) + 1;
      sourceNode.updatedAt = new Date();
      this.nodes.set(sourceNode.id, sourceNode);
    }
    if (targetNode) {
      targetNode.connections = (targetNode.connections || 0) + 1;
      targetNode.updatedAt = new Date();
      this.nodes.set(targetNode.id, targetNode);
    }
    
    return relationship;
  }

  async getRelationships(): Promise<Relationship[]> {
    return Array.from(this.relationships.values());
  }

  async getRelationshipsByNode(nodeId: string): Promise<Relationship[]> {
    return Array.from(this.relationships.values()).filter(
      rel => rel.sourceNodeId === nodeId || rel.targetNodeId === nodeId
    );
  }

  async getRelationshipsByType(relationshipType: string): Promise<Relationship[]> {
    return Array.from(this.relationships.values()).filter(
      rel => rel.relationshipType === relationshipType
    );
  }

  async deleteAllRelationships(): Promise<void> {
    this.relationships.clear();
  }

  async createQuery(insertQuery: InsertQuery): Promise<Query> {
    const id = randomUUID();
    const query: Query = {
      ...insertQuery,
      id,
      cypherQuery: insertQuery.cypherQuery ?? null,
      results: insertQuery.results ?? null,
      timestamp: new Date()
    };
    this.queries.set(id, query);
    return query;
  }

  async getQueries(): Promise<Query[]> {
    return Array.from(this.queries.values());
  }

  async getGraphData(): Promise<GraphData> {
    return {
      nodes: await this.getNodes(),
      relationships: await this.getRelationships()
    };
  }

  async clearGraph(): Promise<void> {
    this.nodes.clear();
    this.relationships.clear();
    this.chunks.clear();
  }

  // Chunk operations
  async createChunk(insertChunk: InsertChunk): Promise<Chunk> {
    const id = randomUUID();
    const chunk: Chunk = {
      id,
      documentId: insertChunk.documentId,
      content: insertChunk.content,
      startIndex: insertChunk.startIndex,
      endIndex: insertChunk.endIndex,
      chunkNumber: insertChunk.chunkNumber,
      wordCount: insertChunk.wordCount || null,
      summary: insertChunk.summary || null,
      embedding: null,
      createdAt: new Date()
    };
    this.chunks.set(id, chunk);
    return chunk;
  }

  async getChunks(): Promise<Chunk[]> {
    return Array.from(this.chunks.values());
  }

  async getChunksByDocument(documentId: string): Promise<Chunk[]> {
    return Array.from(this.chunks.values()).filter(chunk => chunk.documentId === documentId);
  }

  async getChunk(id: string): Promise<Chunk | undefined> {
    return this.chunks.get(id);
  }

  async deleteChunksByDocument(documentId: string): Promise<void> {
    const chunksToDelete = Array.from(this.chunks.entries())
      .filter(([, chunk]) => chunk.documentId === documentId)
      .map(([id]) => id);
    
    for (const chunkId of chunksToDelete) {
      this.chunks.delete(chunkId);
    }
  }

  // Advanced graph operations
  async getNeighborhood(nodeId: string, hops: number = 1): Promise<GraphData> {
    const visitedNodes = new Set<string>([nodeId]);
    const resultNodes = new Set<string>([nodeId]);
    const resultRelationships = new Set<string>();
    
    let currentLevel = new Set([nodeId]);
    
    for (let hop = 0; hop < hops; hop++) {
      const nextLevel = new Set<string>();
      
      for (const currentNodeId of Array.from(currentLevel)) {
        const nodeRels = await this.getRelationshipsByNode(currentNodeId);
        
        for (const rel of nodeRels) {
          resultRelationships.add(rel.id);
          const otherNodeId = rel.sourceNodeId === currentNodeId ? rel.targetNodeId : rel.sourceNodeId;
          
          if (!visitedNodes.has(otherNodeId)) {
            visitedNodes.add(otherNodeId);
            resultNodes.add(otherNodeId);
            nextLevel.add(otherNodeId);
          }
        }
      }
      
      currentLevel = nextLevel;
    }
    
    const nodes = Array.from(resultNodes)
      .map(id => this.nodes.get(id))
      .filter((node): node is Node => node !== undefined);
    
    const relationships = Array.from(resultRelationships)
      .map(id => this.relationships.get(id))
      .filter((rel): rel is Relationship => rel !== undefined);
    
    return { nodes, relationships };
  }

  async searchNodes(query: string): Promise<Node[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.nodes.values()).filter(node => 
      node.name.toLowerCase().includes(lowerQuery) ||
      (node.description && node.description.toLowerCase().includes(lowerQuery)) ||
      (node.summary && node.summary.toLowerCase().includes(lowerQuery)) ||
      (node.aliases && node.aliases.some(alias => alias.toLowerCase().includes(lowerQuery)))
    );
  }

  async getNodesByImportance(minImportance: number): Promise<Node[]> {
    return Array.from(this.nodes.values())
      .filter(node => (node.importance || 0) >= minImportance)
      .sort((a, b) => (b.importance || 0) - (a.importance || 0));
  }
}

export const storage = new MemStorage();
