// Enhanced text processing utilities for knowledge graph extraction
import crypto from 'crypto';
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from '@shared/schema';

export interface TextChunk {
  content: string;
  startIndex: number;
  endIndex: number;
  chunkNumber: number;
  wordCount: number;
  summary?: string;
}

export interface ExtractedEntity {
  name: string;
  type: string;
  entityType: string;
  confidence: number;
  mentions: number;
  aliases: string[];
  startIndex: number;
  endIndex: number;
  context: string;
}

export interface ExtractedRelationship {
  source: string;
  target: string;
  relationshipType: string;
  confidence: number;
  context: string;
  distance: number;
}

export interface ProcessingResult {
  chunks: TextChunk[];
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  metadata: {
    language: string;
    wordCount: number;
    hash: string;
    contentType: string;
  };
}

// Text chunking with smart boundaries
export function createTextChunks(text: string, chunkSize: number = 500, overlap: number = 50): TextChunk[] {
  const words = text.split(/\s+/);
  const chunks: TextChunk[] = [];
  
  let chunkNumber = 0;
  let currentIndex = 0;
  
  while (currentIndex < words.length) {
    const chunkWords = words.slice(currentIndex, currentIndex + chunkSize);
    const chunkText = chunkWords.join(' ');
    
    // Find character positions
    let startCharIndex = 0;
    for (let i = 0; i < currentIndex; i++) {
      startCharIndex += words[i].length + 1; // +1 for space
    }
    
    const endCharIndex = startCharIndex + chunkText.length;
    
    chunks.push({
      content: chunkText,
      startIndex: startCharIndex,
      endIndex: endCharIndex,
      chunkNumber: chunkNumber++,
      wordCount: chunkWords.length,
      summary: generateChunkSummary(chunkText)
    });
    
    // Move forward with overlap
    currentIndex += chunkSize - overlap;
  }
  
  return chunks;
}

// Generate hash for deduplication
export function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content.trim().toLowerCase()).digest('hex');
}

// Detect language (basic implementation)
export function detectLanguage(text: string): string {
  // Simple language detection based on common words
  const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
  const words = text.toLowerCase().split(/\s+/).slice(0, 100); // Check first 100 words
  
  const englishMatches = words.filter(word => englishWords.includes(word)).length;
  
  if (englishMatches > words.length * 0.1) {
    return 'en';
  }
  
  return 'unknown';
}

// Generate simple summary for chunks
function generateChunkSummary(text: string): string {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return '';
  
  // Return first sentence as summary, truncated if too long
  const firstSentence = sentences[0].trim();
  return firstSentence.length > 100 ? firstSentence.substring(0, 97) + '...' : firstSentence;
}

// Enhanced entity extraction with better classification
export function extractEntities(text: string): ExtractedEntity[] {
  const entities: Map<string, ExtractedEntity> = new Map();
  
  // Extract different entity types
  extractPersonNames(text, entities);
  extractOrganizations(text, entities);
  extractLocations(text, entities);
  extractTechnologies(text, entities);
  extractConcepts(text, entities);
  extractDates(text, entities);
  extractMoney(text, entities);
  
  return Array.from(entities.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 100); // Limit to top 100 entities
}

function extractPersonNames(text: string, entities: Map<string, ExtractedEntity>): void {
  // Pattern for person names (Title + First + Last, or First + Last)
  const personPattern = /((?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?)\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+[A-Z][a-z]+)?)/g;
  
  let match;
  while ((match = personPattern.exec(text)) !== null) {
    const fullName = match[0].trim();
    const name = match[2].trim();
    
    // Skip if it's likely not a person name
    if (isLikelyPersonName(name)) {
      addOrUpdateEntity(entities, name, ENTITY_TYPES.PERSON, 'person', 0.7, match.index, fullName);
    }
  }
}

function extractOrganizations(text: string, entities: Map<string, ExtractedEntity>): void {
  // Patterns for organizations
  const orgPatterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Inc\.?|Corp\.?|Corporation|Company|LLC|Ltd\.?|Limited)/g,
    /(?:The\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:University|Institute|Foundation|Organization|Association)/g,
    /([A-Z]{2,}(?:\s+[A-Z]{2,})*)/g // Acronyms
  ];
  
  for (const pattern of orgPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const orgName = match[1] || match[0];
      if (orgName.length > 2 && !isCommonWord(orgName)) {
        addOrUpdateEntity(entities, orgName, ENTITY_TYPES.ORGANIZATION, 'organization', 0.6, match.index, match[0]);
      }
    }
  }
}

function extractLocations(text: string, entities: Map<string, ExtractedEntity>): void {
  // Pattern for locations (cities, countries, etc.)
  const locationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  
  let match;
  while ((match = locationPattern.exec(text)) !== null) {
    const city = match[1].trim();
    const region = match[2].trim();
    
    if (!isCommonWord(city) && !isCommonWord(region)) {
      addOrUpdateEntity(entities, city, ENTITY_TYPES.LOCATION, 'location', 0.6, match.index, match[0]);
      addOrUpdateEntity(entities, region, ENTITY_TYPES.LOCATION, 'location', 0.6, match.index, match[0]);
    }
  }
  
  // Single location names
  const singleLocationPattern = /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  while ((match = singleLocationPattern.exec(text)) !== null) {
    const location = match[1].trim();
    if (!isCommonWord(location) && isLikelyLocation(location)) {
      addOrUpdateEntity(entities, location, ENTITY_TYPES.LOCATION, 'location', 0.5, match.index, match[0]);
    }
  }
}

function extractTechnologies(text: string, entities: Map<string, ExtractedEntity>): void {
  // Technology and product names
  const techPatterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:software|platform|system|technology|framework|library|API|SDK)/gi,
    /\b(React|Vue|Angular|Node\.js|Python|JavaScript|TypeScript|Docker|Kubernetes|AWS|Azure|Google Cloud)/gi
  ];
  
  for (const pattern of techPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const tech = match[1] || match[0];
      if (tech.length > 2) {
        addOrUpdateEntity(entities, tech, ENTITY_TYPES.TECHNOLOGY, 'technology', 0.7, match.index, match[0]);
      }
    }
  }
}

function extractConcepts(text: string, entities: Map<string, ExtractedEntity>): void {
  // General concepts (capitalized terms that aren't other entity types)
  const conceptPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  
  let match;
  while ((match = conceptPattern.exec(text)) !== null) {
    const concept = match[1].trim();
    
    if (concept.length > 2 && !isCommonWord(concept) && !entities.has(concept.toLowerCase())) {
      addOrUpdateEntity(entities, concept, ENTITY_TYPES.CONCEPT, 'concept', 0.4, match.index, match[0]);
    }
  }
}

function extractDates(text: string, entities: Map<string, ExtractedEntity>): void {
  const datePatterns = [
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g,
    /\b(\d{4}-\d{2}-\d{2})\b/g,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi
  ];
  
  for (const pattern of datePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      addOrUpdateEntity(entities, match[0], ENTITY_TYPES.DATE, 'date', 0.8, match.index, match[0]);
    }
  }
}

function extractMoney(text: string, entities: Map<string, ExtractedEntity>): void {
  const moneyPattern = /\$[\d,]+(?:\.\d{2})?|\b\d+\s*(?:dollars?|USD|EUR|GBP)\b/gi;
  
  let match;
  while ((match = moneyPattern.exec(text)) !== null) {
    addOrUpdateEntity(entities, match[0], ENTITY_TYPES.MONEY, 'money', 0.8, match.index, match[0]);
  }
}

function addOrUpdateEntity(
  entities: Map<string, ExtractedEntity>,
  name: string,
  type: string,
  entityType: string,
  confidence: number,
  startIndex: number,
  context: string
): void {
  const key = name.toLowerCase();
  const existing = entities.get(key);
  
  if (existing) {
    existing.mentions++;
    existing.confidence = Math.max(existing.confidence, confidence);
    if (!existing.aliases.includes(name)) {
      existing.aliases.push(name);
    }
  } else {
    entities.set(key, {
      name,
      type,
      entityType,
      confidence,
      mentions: 1,
      aliases: [name],
      startIndex,
      endIndex: startIndex + name.length,
      context: context.substring(0, 100)
    });
  }
}

// Enhanced relationship extraction
export function extractRelationships(text: string, entities: ExtractedEntity[]): ExtractedRelationship[] {
  const relationships: ExtractedRelationship[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  for (const sentence of sentences) {
    const sentenceEntities = entities.filter(entity => 
      sentence.toLowerCase().includes(entity.name.toLowerCase())
    );
    
    if (sentenceEntities.length >= 2) {
      // Extract relationships between entities in the same sentence
      for (let i = 0; i < sentenceEntities.length - 1; i++) {
        for (let j = i + 1; j < sentenceEntities.length; j++) {
          const entity1 = sentenceEntities[i];
          const entity2 = sentenceEntities[j];
          
          const relationshipType = determineRelationshipType(sentence, entity1, entity2);
          const confidence = calculateRelationshipConfidence(sentence, entity1, entity2);
          const distance = Math.abs(entity1.startIndex - entity2.startIndex);
          
          relationships.push({
            source: entity1.name,
            target: entity2.name,
            relationshipType,
            confidence,
            context: sentence.trim(),
            distance
          });
        }
      }
    }
  }
  
  return relationships
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 200); // Limit to top 200 relationships
}

function determineRelationshipType(sentence: string, entity1: ExtractedEntity, entity2: ExtractedEntity): string {
  const lowerSentence = sentence.toLowerCase();
  
  // Specific relationship patterns
  if (entity1.entityType === 'person' && entity2.entityType === 'organization') {
    if (lowerSentence.includes('work') || lowerSentence.includes('employ') || lowerSentence.includes('join')) {
      return RELATIONSHIP_TYPES.WORKS_AT;
    }
    if (lowerSentence.includes('found') || lowerSentence.includes('establish') || lowerSentence.includes('start')) {
      return RELATIONSHIP_TYPES.FOUNDED;
    }
  }
  
  if (entity1.entityType === 'location' || entity2.entityType === 'location') {
    if (lowerSentence.includes('in ') || lowerSentence.includes('at ') || lowerSentence.includes('from ')) {
      return RELATIONSHIP_TYPES.LOCATED_IN;
    }
  }
  
  // General relationship patterns
  if (lowerSentence.includes(' is ') || lowerSentence.includes(' are ') || lowerSentence.includes(' was ') || lowerSentence.includes(' were ')) {
    return RELATIONSHIP_TYPES.IS_A;
  }
  
  if (lowerSentence.includes(' has ') || lowerSentence.includes(' have ') || lowerSentence.includes(' contain')) {
    return RELATIONSHIP_TYPES.CONTAINS;
  }
  
  if (lowerSentence.includes(' part of ') || lowerSentence.includes(' belong')) {
    return RELATIONSHIP_TYPES.PART_OF;
  }
  
  if (lowerSentence.includes(' use ') || lowerSentence.includes(' using ') || lowerSentence.includes(' utilize')) {
    return RELATIONSHIP_TYPES.USED_BY;
  }
  
  if (lowerSentence.includes(' create ') || lowerSentence.includes(' develop ') || lowerSentence.includes(' build')) {
    return RELATIONSHIP_TYPES.CREATED_BY;
  }
  
  if (lowerSentence.includes(' cause ') || lowerSentence.includes(' lead to ') || lowerSentence.includes(' result')) {
    return RELATIONSHIP_TYPES.CAUSES;
  }
  
  if (lowerSentence.includes(' similar ') || lowerSentence.includes(' like ') || lowerSentence.includes(' resemble')) {
    return RELATIONSHIP_TYPES.SIMILAR_TO;
  }
  
  // Default co-occurrence relationship
  return RELATIONSHIP_TYPES.CO_OCCURS;
}

function calculateRelationshipConfidence(sentence: string, entity1: ExtractedEntity, entity2: ExtractedEntity): number {
  let confidence = 0.3; // Base confidence
  
  // Boost confidence based on entity confidence
  confidence += (entity1.confidence + entity2.confidence) / 4;
  
  // Boost confidence based on proximity
  const distance = Math.abs(entity1.startIndex - entity2.startIndex);
  if (distance < 50) confidence += 0.2;
  else if (distance < 100) confidence += 0.1;
  
  // Boost confidence for specific relationship indicators
  const lowerSentence = sentence.toLowerCase();
  const relationshipIndicators = ['is', 'was', 'has', 'works', 'located', 'founded', 'created', 'uses'];
  const indicatorCount = relationshipIndicators.filter(indicator => lowerSentence.includes(indicator)).length;
  confidence += indicatorCount * 0.1;
  
  return Math.min(confidence, 1.0);
}

// Helper functions
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'The', 'This', 'That', 'These', 'Those', 'And', 'But', 'Or', 'For', 'Nor', 'So', 'Yet',
    'Because', 'Since', 'Although', 'While', 'Where', 'When', 'Before', 'After', 'Until',
    'During', 'About', 'Above', 'Below', 'Through', 'Between', 'Among', 'Within', 'Without',
    'All', 'Any', 'Both', 'Each', 'Few', 'More', 'Most', 'Other', 'Some', 'Such', 'Very'
  ]);
  return commonWords.has(word);
}

function isLikelyPersonName(name: string): boolean {
  const words = name.split(' ');
  
  // Skip single letters or very short words
  if (words.some(word => word.length < 2)) return false;
  
  // Skip if it looks like a common word
  if (isCommonWord(name)) return false;
  
  // Check if it has typical person name structure
  if (words.length >= 2 && words.length <= 4) {
    return words.every(word => /^[A-Z][a-z]+$/.test(word));
  }
  
  return false;
}

function isLikelyLocation(location: string): boolean {
  // Simple heuristic - could be enhanced with location database
  const locationIndicators = ['City', 'Town', 'Village', 'County', 'State', 'Province', 'Country'];
  return locationIndicators.some(indicator => location.includes(indicator)) || location.length >= 3;
}

// Main processing function
export function processText(text: string, filename: string): ProcessingResult {
  const contentType = filename.endsWith('.html') ? 'text/html' : 'text/plain';
  const cleanText = cleanTextContent(text, contentType);
  
  const chunks = createTextChunks(cleanText);
  const entities = extractEntities(cleanText);
  const relationships = extractRelationships(cleanText, entities);
  
  const metadata = {
    language: detectLanguage(cleanText),
    wordCount: cleanText.split(/\s+/).length,
    hash: generateContentHash(cleanText),
    contentType
  };
  
  return {
    chunks,
    entities,
    relationships,
    metadata
  };
}

function cleanTextContent(text: string, contentType: string): string {
  if (contentType === 'text/html') {
    // Basic HTML cleaning (this is already done in routes.ts, but adding for completeness)
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
  // Clean text files
  return text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}