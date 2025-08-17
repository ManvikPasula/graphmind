// Natural Language Processing utilities
// Basic implementation for concept extraction and query processing

export interface ConceptExtractionResult {
  concepts: string[];
  relationships: Array<{
    source: string;
    target: string;
    type: string;
    confidence: number;
  }>;
}

export function extractConcepts(text: string): ConceptExtractionResult {
  // Simple concept extraction using basic NLP techniques
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const concepts = new Set<string>();
  const relationships: Array<{ source: string; target: string; type: string; confidence: number }> = [];

  // Extract potential concepts (capitalized words, nouns)
  const conceptRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  
  sentences.forEach(sentence => {
    const matches = sentence.match(conceptRegex) || [];
    matches.forEach(match => {
      if (match.length > 2 && !isCommonWord(match)) {
        concepts.add(match.trim());
      }
    });
  });

  // Simple relationship extraction
  const conceptArray = Array.from(concepts);
  sentences.forEach(sentence => {
    const sentenceConcepts = conceptArray.filter(concept => 
      sentence.includes(concept)
    );
    
    if (sentenceConcepts.length >= 2) {
      for (let i = 0; i < sentenceConcepts.length - 1; i++) {
        const relationshipType = extractRelationshipType(sentence, sentenceConcepts[i], sentenceConcepts[i + 1]);
        relationships.push({
          source: sentenceConcepts[i],
          target: sentenceConcepts[i + 1],
          type: relationshipType,
          confidence: 0.6
        });
      }
    }
  });

  return {
    concepts: Array.from(concepts).slice(0, 50), // Limit to 50 concepts
    relationships: relationships.slice(0, 100) // Limit to 100 relationships
  };
}

function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'The', 'This', 'That', 'These', 'Those', 'And', 'But', 'Or', 'For',
    'Nor', 'So', 'Yet', 'Because', 'Since', 'Although', 'While', 'Where',
    'When', 'Before', 'After', 'Until', 'During', 'About', 'Above', 'Below'
  ]);
  return commonWords.has(word);
}

function extractRelationshipType(sentence: string, concept1: string, concept2: string): string {
  const lowerSentence = sentence.toLowerCase();
  
  if (lowerSentence.includes('is') || lowerSentence.includes('are')) {
    return 'IS_A';
  } else if (lowerSentence.includes('has') || lowerSentence.includes('have')) {
    return 'HAS';
  } else if (lowerSentence.includes('uses') || lowerSentence.includes('use')) {
    return 'USES';
  } else if (lowerSentence.includes('creates') || lowerSentence.includes('create')) {
    return 'CREATES';
  } else if (lowerSentence.includes('contains') || lowerSentence.includes('contain')) {
    return 'CONTAINS';
  } else {
    return 'RELATES_TO';
  }
}

export function translateNaturalLanguageQuery(query: string): string {
  const lowerQuery = query.toLowerCase();
  
  // Simple query pattern matching
  if (lowerQuery.includes('connected to') || lowerQuery.includes('related to')) {
    const concepts = extractConceptsFromQuery(query);
    if (concepts.length >= 2) {
      return `MATCH (a)-[r]-(b) WHERE a.name CONTAINS '${concepts[0]}' AND b.name CONTAINS '${concepts[1]}' RETURN a, r, b`;
    }
  }
  
  if (lowerQuery.includes('find') || lowerQuery.includes('show me')) {
    const concepts = extractConceptsFromQuery(query);
    if (concepts.length > 0) {
      return `MATCH (n) WHERE n.name CONTAINS '${concepts[0]}' RETURN n`;
    }
  }
  
  if (lowerQuery.includes('how many')) {
    return `MATCH (n) RETURN count(n) as total`;
  }
  
  // Default query
  const concepts = extractConceptsFromQuery(query);
  if (concepts.length > 0) {
    return `MATCH (n) WHERE n.name CONTAINS '${concepts[0]}' RETURN n LIMIT 10`;
  }
  
  return `MATCH (n) RETURN n LIMIT 10`;
}

function extractConceptsFromQuery(query: string): string[] {
  // Extract quoted terms and capitalized words
  const quotedTerms = query.match(/"([^"]+)"/g)?.map(match => match.replace(/"/g, '')) || [];
  const capitalizedWords = query.match(/\b[A-Z][a-z]+\b/g) || [];
  
  return [...quotedTerms, ...capitalizedWords].filter(term => term.length > 2);
}
