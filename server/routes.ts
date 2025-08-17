import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDocumentSchema, insertQuerySchema, ENTITY_TYPES, RELATIONSHIP_TYPES } from "@shared/schema";
import { processText } from "./textProcessing";
import multer from "multer";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    // Only allow .txt files
    if (file.mimetype === 'text/plain' || file.originalname.toLowerCase().endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'));
    }
  }
});

// Enhanced web content extraction
function extractWebContent(html: string, url: string): string {
  // Remove script and style elements completely
  let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ');
  content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ');
  content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ');
  content = content.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, ' ');
  
  // Extract title
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  // Extract meta description
  const metaMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const metaDescription = metaMatch ? metaMatch[1].trim() : '';
  
  // Extract headings (h1-h6) with special treatment
  const headings: string[] = [];
  const headingMatches = content.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi);
  if (headingMatches) {
    headingMatches.forEach(match => {
      const text = match.replace(/<[^>]*>/g, '').trim();
      if (text.length > 2) {
        headings.push(text);
      }
    });
  }
  
  // Extract paragraph content
  const paragraphs: string[] = [];
  const pMatches = content.match(/<p[^>]*>([^<]+(?:<[^>]*>[^<]*<\/[^>]*>[^<]*)*)<\/p>/gi);
  if (pMatches) {
    pMatches.forEach(match => {
      const text = match.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 20) { // Only meaningful paragraphs
        paragraphs.push(text);
      }
    });
  }
  
  // Extract list items
  const listItems: string[] = [];
  const liMatches = content.match(/<li[^>]*>([^<]+(?:<[^>]*>[^<]*<\/[^>]*>[^<]*)*)<\/li>/gi);
  if (liMatches) {
    liMatches.forEach(match => {
      const text = match.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 10) {
        listItems.push(text);
      }
    });
  }
  
  // Extract article/main content if present
  const articleMatch = content.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  let articleContent = '';
  if (articleMatch) {
    articleContent = articleMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
  // Combine all extracted content with priority
  let result = '';
  
  if (title) {
    result += `Title: ${title}\n\n`;
  }
  
  if (metaDescription) {
    result += `Description: ${metaDescription}\n\n`;
  }
  
  if (headings.length > 0) {
    result += `Key Topics:\n${headings.join('\n')}\n\n`;
  }
  
  if (articleContent && articleContent.length > 100) {
    result += `Main Content:\n${articleContent}\n\n`;
  } else if (paragraphs.length > 0) {
    result += `Content:\n${paragraphs.slice(0, 10).join('\n\n')}\n\n`;
  }
  
  if (listItems.length > 0) {
    result += `Key Points:\n${listItems.slice(0, 20).join('\n')}\n`;
  }
  
  // If we still don't have much content, do a basic HTML strip as fallback
  if (result.length < 200) {
    const fallback = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    result = fallback.substring(0, 5000); // Limit fallback content
  }
  
  return result.trim();
}

// Enhanced document processing with chunking and deduplication
async function processDocument(content: string, filename: string, documentId: string) {
  try {
    // Process the document (duplicate check already done at upload)
    const processingResult = processText(content, filename);
    
    // Create chunks
    const chunks = [];
    for (const chunkData of processingResult.chunks) {
      const chunk = await storage.createChunk({
        documentId,
        content: chunkData.content,
        startIndex: chunkData.startIndex,
        endIndex: chunkData.endIndex,
        chunkNumber: chunkData.chunkNumber,
        wordCount: chunkData.wordCount,
        summary: chunkData.summary
      });
      chunks.push(chunk);
    }
    
    // Create entity nodes
    const nodeMap = new Map<string, string>();
    for (const entity of processingResult.entities) {
      const canonical = entity.name.toLowerCase();
      let existingNode = await storage.getNodeByName(canonical);
      
      if (!existingNode) {
        const node = await storage.createNode({
          name: entity.name,
          type: 'entity',
          entityType: entity.entityType,
          canonical,
          aliases: entity.aliases,
          confidence: entity.confidence,
          description: `${entity.entityType} extracted from ${filename}`,
          x: Math.random() * 800 + 100,
          y: Math.random() * 600 + 100,
          connections: 0,
          mentions: entity.mentions,
          importance: calculateImportance(entity),
          sourceDocuments: [filename],
          sourceChunks: chunks.map(c => c.id)
        });
        nodeMap.set(canonical, node.id);
      } else {
        // Update existing node
        existingNode.mentions = (existingNode.mentions || 0) + entity.mentions;
        existingNode.confidence = Math.max(existingNode.confidence || 0, entity.confidence);
        existingNode.importance = calculateImportance({
          ...entity,
          mentions: existingNode.mentions
        });
        
        if (!existingNode.sourceDocuments?.includes(filename)) {
          existingNode.sourceDocuments = [...(existingNode.sourceDocuments || []), filename];
        }
        
        const newChunkIds = chunks.map(c => c.id);
        existingNode.sourceChunks = Array.from(new Set([...(existingNode.sourceChunks || []), ...newChunkIds]));
        
        nodeMap.set(canonical, existingNode.id);
      }
    }
    
    // Create relationships
    for (const rel of processingResult.relationships) {
      const sourceId = nodeMap.get(rel.source.toLowerCase());
      const targetId = nodeMap.get(rel.target.toLowerCase());
      
      if (sourceId && targetId && sourceId !== targetId) {
        await storage.createRelationship({
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          relationshipType: rel.relationshipType,
          confidence: rel.confidence,
          context: rel.context,
          distance: rel.distance,
          sourceDocuments: [filename],
          sourceChunks: chunks.map(c => c.id)
        });
      }
    }
    
    return {
      chunks: chunks.length,
      entities: processingResult.entities.length,
      relationships: processingResult.relationships.length,
      metadata: processingResult.metadata
    };
    
  } catch (error) {
    console.error('Error processing document:', error);
    throw error;
  }
}

function calculateImportance(entity: any): number {
  let importance = entity.confidence * 0.4;
  importance += Math.min(entity.mentions * 0.1, 0.4); // Max 0.4 from mentions
  importance += entity.entityType === ENTITY_TYPES.PERSON ? 0.1 : 0;
  importance += entity.entityType === ENTITY_TYPES.ORGANIZATION ? 0.08 : 0;
  importance += entity.entityType === ENTITY_TYPES.TECHNOLOGY ? 0.06 : 0;
  return Math.min(importance, 1.0);
}

// Enhanced natural language query processing with intelligent context analysis
async function processNaturalLanguageQuery(question: string, graphData: any) {
  const lowerQuestion = question.toLowerCase();
  const words = lowerQuestion.split(/\s+/);
  const keywords = words.filter(word => word.length > 2 && !['the', 'and', 'are', 'was', 'for', 'with', 'how', 'what', 'who', 'when', 'where', 'why', 'does', 'did', 'will', 'can', 'could', 'would', 'should'].includes(word));
  
  // Get documents for context enrichment
  const documents = await storage.getDocuments();
  const contextMap = new Map<string, string[]>();
  
  // Extract relevant context from document content
  keywords.forEach(keyword => {
    documents.forEach(doc => {
      if (doc.content && doc.content.toLowerCase().includes(keyword.toLowerCase())) {
        if (!contextMap.has(keyword)) {
          contextMap.set(keyword, []);
        }
        
        // Extract context sentences containing the keyword
        const sentences = doc.content.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const relevantSentences = sentences.filter(sentence => 
          sentence.toLowerCase().includes(keyword.toLowerCase())
        ).slice(0, 2); // Limit to 2 most relevant sentences per keyword
        
        contextMap.get(keyword)?.push(...relevantSentences.map(s => s.trim()));
      }
    });
  });
  
  // Enhanced keyword extraction with synonyms and related terms
  const expandedKeywords = [...keywords];
  keywords.forEach(keyword => {
    // Add partial matches and variations
    graphData.nodes.forEach((node: any) => {
      const nodeName = node.name.toLowerCase();
      if (nodeName.includes(keyword) && !expandedKeywords.includes(nodeName)) {
        expandedKeywords.push(nodeName);
      }
    });
  });
  
  // Find relevant nodes with improved scoring
  const nodeScores = new Map();
  graphData.nodes.forEach((node: any) => {
    const nodeName = node.name.toLowerCase();
    let score = 0;
    
    // Exact matches get highest score
    expandedKeywords.forEach(keyword => {
      if (nodeName === keyword) score += 100;
      else if (nodeName.includes(keyword)) score += 50;
      else if (keyword.includes(nodeName)) score += 30;
      else if (levenshteinDistance(nodeName, keyword) <= 1) score += 40;
      else if (levenshteinDistance(nodeName, keyword) <= 2) score += 20;
    });
    
    // Boost important nodes
    if (node.importance) score += node.importance * 20;
    if (node.connections) score += node.connections * 2;
    
    // Boost based on entity type relevance
    if (lowerQuestion.includes('person') && node.entityType === 'person') score += 30;
    if (lowerQuestion.includes('organization') && node.entityType === 'organization') score += 30;
    if (lowerQuestion.includes('technology') && node.entityType === 'technology') score += 30;
    if (lowerQuestion.includes('location') && node.entityType === 'location') score += 30;
    
    if (score > 0) {
      nodeScores.set(node.id, score);
    }
  });
  
  // Get top relevant nodes sorted by score
  const relevantNodes = Array.from(nodeScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nodeId]) => graphData.nodes.find((n: any) => n.id === nodeId));
  
  let answer = '';
  let cypherQuery = '';
  let subgraphNodes = relevantNodes;
  let subgraphRelationships: any[] = [];
  
  // Advanced query type detection and processing
  if (lowerQuestion.includes('connected') || lowerQuestion.includes('related') || lowerQuestion.includes('relationship') || lowerQuestion.includes('link')) {
    // Connection analysis queries
    const nodeIds = relevantNodes.map((n: any) => n.id);
    subgraphRelationships = graphData.relationships.filter((rel: any) => 
      nodeIds.includes(rel.sourceNodeId) || nodeIds.includes(rel.targetNodeId)
    );
    
    // Find all connected nodes within 2 hops
    const allConnectedNodeIds = new Set(nodeIds);
    let currentHop = new Set(nodeIds);
    
    // First hop
    subgraphRelationships.forEach((rel: any) => {
      if (currentHop.has(rel.sourceNodeId)) allConnectedNodeIds.add(rel.targetNodeId);
      if (currentHop.has(rel.targetNodeId)) allConnectedNodeIds.add(rel.sourceNodeId);
    });
    
    // Include relationships for visualization
    const expandedRels = graphData.relationships.filter((rel: any) => 
      allConnectedNodeIds.has(rel.sourceNodeId) && allConnectedNodeIds.has(rel.targetNodeId)
    );
    subgraphRelationships = expandedRels;
    subgraphNodes = graphData.nodes.filter((node: any) => allConnectedNodeIds.has(node.id));
    
    if (relevantNodes.length >= 2) {
      const directConnections = expandedRels.filter((rel: any) => 
        nodeIds.includes(rel.sourceNodeId) && nodeIds.includes(rel.targetNodeId)
      );
      
      if (directConnections.length > 0) {
        const relationshipDetails = directConnections.map((rel: any) => {
          const sourceNode = graphData.nodes.find((n: any) => n.id === rel.sourceNodeId);
          const targetNode = graphData.nodes.find((n: any) => n.id === rel.targetNodeId);
          return `${sourceNode?.name} ${rel.relationshipType} ${targetNode?.name}`;
        });
        answer = `Found ${directConnections.length} direct connections:\n${relationshipDetails.join('\n')}`;
      } else {
        const pathConnections = expandedRels.filter((rel: any) =>
          nodeIds.some(id => rel.sourceNodeId === id || rel.targetNodeId === id)
        );
        if (pathConnections.length > 0) {
          answer = `${relevantNodes.map((n: any) => n.name).join(' and ')} are connected through ${pathConnections.length} intermediate relationships in the knowledge graph.`;
        } else {
          answer = `No direct connections found between ${relevantNodes.map((n: any) => n.name).join(' and ')}.`;
        }
      }
    } else if (relevantNodes.length === 1) {
      const connections = expandedRels.filter((rel: any) => 
        rel.sourceNodeId === relevantNodes[0].id || rel.targetNodeId === relevantNodes[0].id
      );
      const connectedEntities = connections.map((rel: any) => {
        const connectedId = rel.sourceNodeId === relevantNodes[0].id ? rel.targetNodeId : rel.sourceNodeId;
        const connectedNode = graphData.nodes.find((n: any) => n.id === connectedId);
        return `${rel.relationshipType} ${connectedNode?.name}`;
      }).slice(0, 8);
      
      answer = `${relevantNodes[0].name} is connected to ${connections.length} other concepts:\n${connectedEntities.join('\n')}`;
    } else {
      answer = `No specific entities found matching your query terms.`;
    }
    
    cypherQuery = `MATCH (a)-[r]-(b) WHERE a.name IN [${relevantNodes.map((n: any) => `'${n.name.replace(/'/g, "\\'")}'`).join(', ')}] RETURN a, r, b`;
    
  } else if (lowerQuestion.includes('what is') || lowerQuestion.includes('describe') || lowerQuestion.includes('tell me about') || lowerQuestion.includes('explain')) {
    // Definition and explanation queries
    if (relevantNodes.length > 0) {
      const primaryNode = relevantNodes[0];
      const connections = graphData.relationships.filter((rel: any) => 
        rel.sourceNodeId === primaryNode.id || rel.targetNodeId === primaryNode.id
      );
      
      // Build comprehensive description
      const entityType = primaryNode.entityType || primaryNode.type || 'concept';
      let description = `${primaryNode.name} is a ${entityType}`;
      
      if (primaryNode.description) {
        description += ` - ${primaryNode.description}`;
      }
      
      description += `.\n\n`;
      
      // Add contextual information from documents
      const nodeNameLower = primaryNode.name.toLowerCase();
      if (contextMap.has(nodeNameLower)) {
        const contexts = contextMap.get(nodeNameLower);
        if (contexts && contexts.length > 0) {
          description += `From the documents:\n`;
          contexts.slice(0, 3).forEach((context: string, idx: number) => {
            description += `${idx + 1}. ${context}\n`;
          });
          description += `\n`;
        }
      }
      
      if (connections.length > 0) {
        // Group relationships by type for better organization
        const relationshipGroups = connections.reduce((groups: any, rel: any) => {
          const type = rel.relationshipType;
          if (!groups[type]) groups[type] = [];
          
          const connectedNodeId = rel.sourceNodeId === primaryNode.id ? rel.targetNodeId : rel.sourceNodeId;
          const connectedNode = graphData.nodes.find((n: any) => n.id === connectedNodeId);
          if (connectedNode) {
            groups[type].push(connectedNode.name);
          }
          return groups;
        }, {});
        
        description += `Key relationships:\n`;
        Object.entries(relationshipGroups).forEach(([relType, entities]: [string, any]) => {
          description += `• ${relType}: ${entities.slice(0, 5).join(', ')}`;
          if (entities.length > 5) description += ` and ${entities.length - 5} more`;
          description += `\n`;
        });
      }
      
      answer = description;
      cypherQuery = `MATCH (n {name: '${primaryNode.name.replace(/'/g, "\\'")}'})-[r]-(connected) RETURN n, r, connected`;
      
      // Include connected nodes in subgraph
      const connectedNodeIds = connections.map((rel: any) => 
        rel.sourceNodeId === primaryNode.id ? rel.targetNodeId : rel.sourceNodeId
      );
      subgraphNodes = [primaryNode, ...graphData.nodes.filter((n: any) => connectedNodeIds.includes(n.id))];
      subgraphRelationships = connections;
    } else {
      // Even if no nodes found, try to provide context from documents
      let fallbackContext = "";
      keywords.forEach(keyword => {
        if (contextMap.has(keyword)) {
          const contexts = contextMap.get(keyword);
          if (contexts && contexts.length > 0) {
            fallbackContext += `\nRegarding "${keyword}":\n${contexts[0]}\n`;
          }
        }
      });
      
      if (fallbackContext) {
        answer = `I couldn't find "${question.replace(/what is |describe |tell me about |explain /i, '')}" as a specific concept in the knowledge graph, but found this relevant information in the documents:${fallbackContext}`;
      } else {
        answer = `I couldn't find specific information about "${question.replace(/what is |describe |tell me about |explain /i, '')}" in the knowledge graph. The available concepts are: ${graphData.nodes.slice(0, 10).map((n: any) => n.name).join(', ')}`;
      }
    }
    
  } else if (lowerQuestion.includes('how many') || lowerQuestion.includes('count')) {
    // Counting and statistics queries
    if (lowerQuestion.includes('node') || lowerQuestion.includes('concept') || lowerQuestion.includes('entit')) {
      const entityStats = graphData.nodes.reduce((stats: any, node: any) => {
        const type = node.entityType || 'unknown';
        stats[type] = (stats[type] || 0) + 1;
        return stats;
      }, {});
      
      answer = `The knowledge graph contains ${graphData.nodes.length} concepts:\n`;
      Object.entries(entityStats).forEach(([type, count]) => {
        answer += `• ${type}: ${count}\n`;
      });
      
      cypherQuery = `MATCH (n) RETURN n.entityType as type, count(n) as count ORDER BY count DESC`;
    } else if (lowerQuestion.includes('relationship') || lowerQuestion.includes('connection')) {
      const relStats = graphData.relationships.reduce((stats: any, rel: any) => {
        const type = rel.relationshipType;
        stats[type] = (stats[type] || 0) + 1;
        return stats;
      }, {});
      
      answer = `The knowledge graph contains ${graphData.relationships.length} relationships:\n`;
      Object.entries(relStats).forEach(([type, count]) => {
        answer += `• ${type}: ${count}\n`;
      });
      
      cypherQuery = `MATCH ()-[r]-() RETURN type(r) as relationship_type, count(r) as count ORDER BY count DESC`;
    } else if (relevantNodes.length > 0) {
      answer = `Found ${relevantNodes.length} concepts matching your query: ${relevantNodes.map((n: any) => n.name).join(', ')}`;
      cypherQuery = `MATCH (n) WHERE ${expandedKeywords.map(k => `toLower(n.name) CONTAINS '${k.replace(/'/g, "\\'")}'`).join(' OR ')} RETURN count(n)`;
    } else {
      answer = `No matching concepts found for counting.`;
    }
    
  } else {
    // General search and information queries
    if (relevantNodes.length > 0) {
      // Provide rich contextual information
      const topNodes = relevantNodes.slice(0, 5);
      answer = `Found ${relevantNodes.length} relevant concepts:\n\n`;
      
      topNodes.forEach((node: any, index: number) => {
        const connections = graphData.relationships.filter((rel: any) => 
          rel.sourceNodeId === node.id || rel.targetNodeId === node.id
        );
        
        answer += `${index + 1}. ${node.name} (${node.entityType || node.type})`;
        if (node.description) answer += ` - ${node.description}`;
        
        // Add contextual information from documents
        const nodeNameLower = node.name.toLowerCase();
        if (contextMap.has(nodeNameLower)) {
          const contexts = contextMap.get(nodeNameLower);
          if (contexts && contexts.length > 0) {
            answer += `\n   Context: "${contexts[0].substring(0, 100)}${contexts[0].length > 100 ? '...' : ''}"`;
          }
        }
        
        answer += `\n   Connected to ${connections.length} other concepts`;
        
        if (connections.length > 0) {
          const topConnections = connections.slice(0, 3).map((rel: any) => {
            const connectedId = rel.sourceNodeId === node.id ? rel.targetNodeId : rel.sourceNodeId;
            const connectedNode = graphData.nodes.find((n: any) => n.id === connectedId);
            return `${rel.relationshipType} ${connectedNode?.name}`;
          });
          answer += `: ${topConnections.join(', ')}`;
          if (connections.length > 3) answer += ` and ${connections.length - 3} more`;
        }
        answer += `\n\n`;
      });
      
      // Include comprehensive subgraph
      const nodeIds = topNodes.map((n: any) => n.id);
      subgraphRelationships = graphData.relationships.filter((rel: any) => 
        nodeIds.includes(rel.sourceNodeId) || nodeIds.includes(rel.targetNodeId)
      );
      
      const allConnectedIds = new Set(nodeIds);
      subgraphRelationships.forEach((rel: any) => {
        allConnectedIds.add(rel.sourceNodeId);
        allConnectedIds.add(rel.targetNodeId);
      });
      
      subgraphNodes = graphData.nodes.filter((node: any) => allConnectedIds.has(node.id));
      
      cypherQuery = `MATCH (n) WHERE ${expandedKeywords.map(k => `toLower(n.name) CONTAINS '${k.replace(/'/g, "\\'")}'`).join(' OR ')} RETURN n ORDER BY n.importance DESC LIMIT 10`;
    } else {
      // Even if no entities found, try to provide context from documents
      let contextualAnswer = "";
      const foundContexts: string[] = [];
      
      keywords.forEach(keyword => {
        if (contextMap.has(keyword)) {
          const contexts = contextMap.get(keyword);
          if (contexts && contexts.length > 0) {
            foundContexts.push(`"${keyword}": ${contexts[0].substring(0, 150)}${contexts[0].length > 150 ? '...' : ''}`);
          }
        }
      });
      
      if (foundContexts.length > 0) {
        contextualAnswer = `No specific concepts found in the knowledge graph for "${keywords.join(', ')}", but found relevant information in the documents:\n\n${foundContexts.join('\n\n')}`;
        answer = contextualAnswer;
      } else {
        // Provide helpful suggestions
        const allConcepts = graphData.nodes.map((n: any) => n.name).slice(0, 15);
        answer = `No concepts found matching "${keywords.join(', ')}". \n\nAvailable concepts in the knowledge graph include: ${allConcepts.join(', ')}${graphData.nodes.length > 15 ? ' and more' : ''}.`;
      }
      
      cypherQuery = `MATCH (n) RETURN n.name, n.entityType LIMIT 20`;
      subgraphNodes = graphData.nodes.slice(0, 10);
      subgraphRelationships = [];
    }
  }
  
  return {
    answer,
    relevantNodes: subgraphNodes,
    relationships: subgraphRelationships,
    cypherQuery,
    subgraph: {
      nodes: subgraphNodes,
      relationships: subgraphRelationships
    }
  };
}

// Simple string distance calculation for fuzzy matching
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Upload document
  app.post("/api/documents", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      // Check total storage usage
      const existingDocs = await storage.getDocuments();
      const totalSize = existingDocs.reduce((sum, doc) => sum + doc.size, 0);
      
      if (totalSize + req.file.size > 100 * 1024 * 1024) {
        return res.status(400).json({ message: "Total storage limit of 100MB exceeded" });
      }
      
      const content = req.file.buffer.toString('utf-8');
      // Calculate metadata
      const processingPreview = processText(content, req.file?.originalname || 'unknown');
      
      // Check for duplicates BEFORE creating the document
      const existingDoc = await storage.getDocumentByHash(processingPreview.metadata.hash);
      if (existingDoc) {
        return res.status(409).json({ 
          message: "Document already exists", 
          duplicate: true,
          existing: existingDoc.filename 
        });
      }
      
      const document = await storage.createDocument({
        filename: req.file?.originalname || 'unknown',
        content,
        size: req.file.size,
        contentType: 'text/plain',
        language: processingPreview.metadata.language,
        wordCount: processingPreview.metadata.wordCount,
        hash: processingPreview.metadata.hash
      });
      
      // Create a document node
      const documentNode = await storage.createNode({
        name: req.file.originalname,
        type: 'document',
        description: `Document: ${req.file.originalname}`,
        properties: { 
          source: 'file',
          size: req.file.size,
          uploadedAt: new Date().toISOString()
        },
        x: Math.random() * 800 + 100,
        y: Math.random() * 600 + 100,
        connections: 0,
        sourceDocuments: [req.file.originalname]
      });
      
      // Process document with enhanced features
      setImmediate(async () => {
        try {
          const result = await processDocument(content, req.file?.originalname || 'unknown', document.id);
          console.log(`Processed document: ${result.chunks} chunks, ${result.entities} entities, ${result.relationships} relationships`);
          await storage.updateDocumentProcessed(document.id, 1);
        } catch (error) {
          console.error('Error processing document:', error);
          await storage.updateDocumentProcessed(document.id, 2);
        }
      });
      
      res.json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Add URL
  app.post("/api/documents/url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }
      
      // Fetch URL content with proper headers
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const content = await response.text();
      
      // Enhanced content extraction
      const textContent = extractWebContent(content, url);
      
      if (textContent.length > 100 * 1024 * 1024) {
        return res.status(400).json({ message: "Content too large" });
      }
      
      if (textContent.length < 100) {
        return res.status(400).json({ message: "Not enough meaningful content found" });
      }
      
      // Calculate metadata
      const processingPreview = processText(textContent, url);
      
      // Check for duplicates BEFORE creating the document
      const existingDoc = await storage.getDocumentByHash(processingPreview.metadata.hash);
      if (existingDoc) {
        return res.status(409).json({ 
          message: "URL content already exists", 
          duplicate: true,
          existing: existingDoc.filename 
        });
      }
      
      const document = await storage.createDocument({
        filename: url,
        content: textContent,
        size: textContent.length,
        contentType: 'text/html',
        language: processingPreview.metadata.language,
        wordCount: processingPreview.metadata.wordCount,
        hash: processingPreview.metadata.hash
      });
      
      // Process URL document with enhanced features
      setImmediate(async () => {
        try {
          const result = await processDocument(textContent, url, document.id);
          console.log(`Processed URL: ${result.chunks} chunks, ${result.entities} entities, ${result.relationships} relationships`);
          await storage.updateDocumentProcessed(document.id, 1);
        } catch (error) {
          console.error('Error processing URL document:', error);
          await storage.updateDocumentProcessed(document.id, 2);
        }
      });
      
      res.json(document);
    } catch (error) {
      console.error('Error fetching URL:', error);
      res.status(500).json({ message: "Failed to fetch URL content" });
    }
  });

  // Get documents
  app.get("/api/documents", async (req, res) => {
    try {
      const documents = await storage.getDocuments();
      res.json(documents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Delete document
  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteDocument(id);
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Get graph data
  app.get("/api/graph", async (req, res) => {
    try {
      const graphData = await storage.getGraphData();
      res.json(graphData);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch graph data" });
    }
  });

  // Get graph statistics
  app.get("/api/graph/stats", async (req, res) => {
    try {
      const nodes = await storage.getNodes();
      const relationships = await storage.getRelationships();
      const documents = await storage.getDocuments();
      
      const entityTypeStats = nodes.reduce((acc, node) => {
        const type = node.entityType || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const relationshipTypeStats = relationships.reduce((acc, rel) => {
        const type = rel.relationshipType;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const stats = {
        totalNodes: nodes.length,
        totalRelationships: relationships.length,
        totalDocuments: documents.length,
        entityTypes: entityTypeStats,
        relationshipTypes: relationshipTypeStats,
        avgConnections: nodes.length > 0 ? nodes.reduce((sum, n) => sum + (n.connections || 0), 0) / nodes.length : 0,
        mostConnectedNode: nodes.length > 0 ? nodes.reduce((max, node) => 
          (node.connections || 0) > (max.connections || 0) ? node : max) : null,
        mostImportantNode: nodes.length > 0 ? nodes.reduce((max, node) => 
          (node.importance || 0) > (max.importance || 0) ? node : max) : null
      };
      
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get graph statistics" });
    }
  });

  // Clear graph
  app.delete("/api/graph", async (req, res) => {
    try {
      await storage.clearGraph();
      res.json({ message: "Graph cleared successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear graph" });
    }
  });

  // Update node position
  app.patch("/api/nodes/:id/position", async (req, res) => {
    try {
      const { id } = req.params;
      const { x, y } = req.body;
      await storage.updateNodePosition(id, x, y);
      res.json({ message: "Node position updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update node position" });
    }
  });

  // Get node neighborhood
  app.get("/api/graph/neighborhood/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const hops = parseInt(req.query.hops as string) || 1;
      const neighborhood = await storage.getNeighborhood(id, Math.min(hops, 3)); // Limit to 3 hops
      res.json(neighborhood);
    } catch (error) {
      res.status(500).json({ message: "Failed to get neighborhood" });
    }
  });

  // Search nodes
  app.get("/api/nodes/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json([]);
      }
      const nodes = await storage.searchNodes(query);
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ message: "Failed to search nodes" });
    }
  });

  // Get nodes by type
  app.get("/api/nodes/type/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const nodes = await storage.getNodesByType(type);
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ message: "Failed to get nodes by type" });
    }
  });

  // Get nodes by entity type
  app.get("/api/nodes/entity/:entityType", async (req, res) => {
    try {
      const { entityType } = req.params;
      const nodes = await storage.getNodesByEntityType(entityType);
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ message: "Failed to get nodes by entity type" });
    }
  });

  // Get nodes by importance
  app.get("/api/nodes/important", async (req, res) => {
    try {
      const minImportance = parseFloat(req.query.min as string) || 0.5;
      const nodes = await storage.getNodesByImportance(minImportance);
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ message: "Failed to get important nodes" });
    }
  });

  // Natural language query
  app.post("/api/query", async (req, res) => {
    try {
      const { question } = insertQuerySchema.parse(req.body);
      const graphData = await storage.getGraphData();
      
      const result = await processNaturalLanguageQuery(question, graphData);
      
      const query = await storage.createQuery({
        question,
        cypherQuery: result.cypherQuery,
        results: result
      });
      
      res.json(result);
    } catch (error) {
      console.error('Query processing error:', error);
      res.status(500).json({ message: "Failed to process query" });
    }
  });

  // Export graph in multiple formats
  app.get("/api/export", async (req, res) => {
    try {
      const format = req.query.format as string || 'json';
      const graphData = await storage.getGraphData();
      
      switch (format.toLowerCase()) {
        case 'json':
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename="knowledge-graph.json"');
          res.json(graphData);
          break;
          
        case 'graphml':
          const graphml = generateGraphML(graphData);
          res.setHeader('Content-Type', 'application/xml');
          res.setHeader('Content-Disposition', 'attachment; filename="knowledge-graph.graphml"');
          res.send(graphml);
          break;
          
        case 'csv':
          const csv = generateCSV(graphData);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="knowledge-graph.csv"');
          res.send(csv);
          break;
          
        default:
          res.status(400).json({ message: "Unsupported format. Use: json, graphml, or csv" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to export graph" });
    }
  });
  
  // Generate GraphML format
  function generateGraphML(graphData: any): string {
    let graphml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    graphml += `<graphml xmlns="http://graphml.graphdrawing.org/xmlns"\n`;
    graphml += `    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n`;
    graphml += `    xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns\n`;
    graphml += `     http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">\n`;
    
    // Define keys
    graphml += `  <key id="name" for="node" attr.name="name" attr.type="string"/>\n`;
    graphml += `  <key id="type" for="node" attr.name="type" attr.type="string"/>\n`;
    graphml += `  <key id="description" for="node" attr.name="description" attr.type="string"/>\n`;
    graphml += `  <key id="relationshipType" for="edge" attr.name="relationshipType" attr.type="string"/>\n`;
    graphml += `  <key id="strength" for="edge" attr.name="strength" attr.type="double"/>\n`;
    
    graphml += `  <graph id="G" edgedefault="undirected">\n`;
    
    // Add nodes
    graphData.nodes.forEach((node: any) => {
      graphml += `    <node id="${node.id}">\n`;
      graphml += `      <data key="name">${escapeXml(node.name)}</data>\n`;
      graphml += `      <data key="type">${escapeXml(node.type)}</data>\n`;
      if (node.description) {
        graphml += `      <data key="description">${escapeXml(node.description)}</data>\n`;
      }
      graphml += `    </node>\n`;
    });
    
    // Add edges
    graphData.relationships.forEach((rel: any, index: number) => {
      graphml += `    <edge id="e${index}" source="${rel.sourceNodeId}" target="${rel.targetNodeId}">\n`;
      graphml += `      <data key="relationshipType">${escapeXml(rel.relationshipType)}</data>\n`;
      if (rel.strength) {
        graphml += `      <data key="strength">${rel.strength}</data>\n`;
      }
      graphml += `    </edge>\n`;
    });
    
    graphml += `  </graph>\n`;
    graphml += `</graphml>`;
    
    return graphml;
  }
  
  // Generate CSV format
  function generateCSV(graphData: any): string {
    let csv = 'Type,Id,Name,Source,Target,Relationship,Strength,Description\n';
    
    // Add nodes
    graphData.nodes.forEach((node: any) => {
      csv += `node,${node.id},"${escapeCsv(node.name)}",,,,,"${escapeCsv(node.description || '')}",\n`;
    });
    
    // Add relationships
    graphData.relationships.forEach((rel: any) => {
      const sourceName = graphData.nodes.find((n: any) => n.id === rel.sourceNodeId)?.name || rel.sourceNodeId;
      const targetName = graphData.nodes.find((n: any) => n.id === rel.targetNodeId)?.name || rel.targetNodeId;
      csv += `edge,${rel.id},,"${escapeCsv(sourceName)}","${escapeCsv(targetName)}","${escapeCsv(rel.relationshipType)}",${rel.strength || 1},\n`;
    });
    
    return csv;
  }
  
  function escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&apos;');
  }
  
  function escapeCsv(str: string): string {
    return str.replace(/"/g, '""');
  }

  const httpServer = createServer(app);
  return httpServer;
}
