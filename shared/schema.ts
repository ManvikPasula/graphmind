import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  content: text("content").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  processed: integer("processed").default(0), // 0 = pending, 1 = processed, 2 = error
  contentType: text("content_type"), // text/plain, text/html, etc.
  language: text("language"), // detected language
  wordCount: integer("word_count"),
  hash: text("hash"), // for deduplication
});

// New table for text chunks
export const chunks = pgTable("chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id),
  content: text("content").notNull(),
  startIndex: integer("start_index").notNull(),
  endIndex: integer("end_index").notNull(),
  chunkNumber: integer("chunk_number").notNull(),
  wordCount: integer("word_count"),
  summary: text("summary"),
  embedding: text("embedding"), // JSON array for vector similarity
  createdAt: timestamp("created_at").defaultNow(),
});

export const nodes = pgTable("nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // entity, document, chunk, concept
  entityType: text("entity_type"), // person, organization, location, term, event, etc.
  label: text("label"), // display label
  canonical: text("canonical"), // normalized name for deduplication
  aliases: text("aliases").array().default([]), // alternative names
  confidence: real("confidence").default(1.0), // extraction confidence
  description: text("description"),
  summary: text("summary"), // generated summary
  properties: jsonb("properties"),
  x: real("x"),
  y: real("y"),
  connections: integer("connections").default(0),
  sourceDocuments: text("source_documents").array().default([]),
  sourceChunks: text("source_chunks").array().default([]), // chunk IDs for citations
  mentions: integer("mentions").default(1), // frequency of mentions
  importance: real("importance").default(0.5), // calculated importance score
  // Document/URL specific fields
  source: text("source"), // 'file' or 'url'
  size: integer("size"), // for documents
  fetchedAt: timestamp("fetched_at"), // for URLs
  // Chunk specific fields
  documentId: varchar("document_id").references(() => documents.id),
  chunkId: varchar("chunk_id").references(() => chunks.id),
  startIndex: integer("start_index"), // position in source
  endIndex: integer("end_index"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const relationships = pgTable("relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceNodeId: varchar("source_node_id").notNull().references(() => nodes.id),
  targetNodeId: varchar("target_node_id").notNull().references(() => nodes.id),
  relationshipType: text("relationship_type").notNull(), // MENTIONS, CO_OCCURS, IS_A, PART_OF, WORKS_AT, LOCATED_IN, etc.
  label: text("label"), // display label for relationship
  direction: text("direction").default("undirected"), // directed, undirected, bidirectional
  strength: real("strength").default(1.0),
  weight: real("weight").default(1.0), // for co-occurrence weighting
  confidence: real("confidence").default(0.5), // extraction confidence
  count: integer("count").default(1), // mention count
  distance: integer("distance").default(1), // semantic distance
  context: text("context"), // surrounding text context
  sourceChunks: text("source_chunks").array().default([]), // chunk IDs for citations
  sourceDocuments: text("source_documents").array().default([]),
  extractedAt: timestamp("extracted_at").defaultNow(),
  properties: jsonb("properties"),
});

export const queries = pgTable("queries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  cypherQuery: text("cypher_query"),
  results: jsonb("results"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documents).pick({
  filename: true,
  content: true,
  size: true,
  contentType: true,
  language: true,
  wordCount: true,
  hash: true,
});

export const insertChunkSchema = createInsertSchema(chunks).pick({
  documentId: true,
  content: true,
  startIndex: true,
  endIndex: true,
  chunkNumber: true,
  wordCount: true,
  summary: true,
});

export const insertNodeSchema = createInsertSchema(nodes).pick({
  name: true,
  type: true,
  entityType: true,
  label: true,
  canonical: true,
  aliases: true,
  confidence: true,
  description: true,
  summary: true,
  properties: true,
  x: true,
  y: true,
  connections: true,
  sourceDocuments: true,
  sourceChunks: true,
  mentions: true,
  importance: true,
  documentId: true,
  chunkId: true,
  startIndex: true,
  endIndex: true,
});

export const insertRelationshipSchema = createInsertSchema(relationships).pick({
  sourceNodeId: true,
  targetNodeId: true,
  relationshipType: true,
  label: true,
  direction: true,
  strength: true,
  weight: true,
  confidence: true,
  count: true,
  distance: true,
  context: true,
  sourceChunks: true,
  sourceDocuments: true,
  properties: true,
});

export const insertQuerySchema = createInsertSchema(queries).pick({
  question: true,
  cypherQuery: true,
  results: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertChunk = z.infer<typeof insertChunkSchema>;
export type Chunk = typeof chunks.$inferSelect;

export type InsertNode = z.infer<typeof insertNodeSchema>;
export type Node = typeof nodes.$inferSelect;

export type InsertRelationship = z.infer<typeof insertRelationshipSchema>;
export type Relationship = typeof relationships.$inferSelect;

export type InsertQuery = z.infer<typeof insertQuerySchema>;
export type Query = typeof queries.$inferSelect;

export interface GraphData {
  nodes: Node[];
  relationships: Relationship[];
}

export interface QueryResult {
  answer: string;
  relevantNodes: Node[];
  relationships: Relationship[];
  citations: Array<{
    chunkId: string;
    documentName: string;
    excerpt: string;
    startIndex: number;
    endIndex: number;
  }>;
  cypherQuery?: string;
  subgraph: {
    nodes: Node[];
    relationships: Relationship[];
  };
}

// Entity types for enhanced concept extraction
export const ENTITY_TYPES = {
  PERSON: 'person',
  ORGANIZATION: 'organization',
  LOCATION: 'location',
  EVENT: 'event',
  CONCEPT: 'concept',
  PRODUCT: 'product',
  TECHNOLOGY: 'technology',
  DATE: 'date',
  MONEY: 'money',
  DOCUMENT: 'document',
  CHUNK: 'chunk',
  URL: 'url'
} as const;

// Relationship types for enhanced relationship extraction
export const RELATIONSHIP_TYPES = {
  MENTIONS: 'MENTIONS',
  CO_OCCURS: 'CO_OCCURS',
  IS_A: 'IS_A',
  PART_OF: 'PART_OF',
  CONTAINS: 'CONTAINS',
  WORKS_AT: 'WORKS_AT',
  LOCATED_IN: 'LOCATED_IN',
  FOUNDED: 'FOUNDED',
  ACQUIRED: 'ACQUIRED',
  RELATED_TO: 'RELATED_TO',
  SIMILAR_TO: 'SIMILAR_TO',
  OPPOSITE_OF: 'OPPOSITE_OF',
  CAUSES: 'CAUSES',
  USED_BY: 'USED_BY',
  CREATED_BY: 'CREATED_BY'
} as const;

export type EntityType = typeof ENTITY_TYPES[keyof typeof ENTITY_TYPES];
export type RelationshipType = typeof RELATIONSHIP_TYPES[keyof typeof RELATIONSHIP_TYPES];
