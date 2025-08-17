# Knowledge Graph Application

## Overview

This is a knowledge graph visualization application built with React, Express, and PostgreSQL. The system allows users to upload documents (files or URLs), extract concepts and relationships using NLP techniques, and visualize the resulting knowledge graph as an interactive network. Users can search the knowledge base using natural language queries and explore connections between concepts through a dynamic graph interface.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React with TypeScript**: Modern component-based UI using functional components and hooks
- **Vite**: Fast development server and build tool for optimal performance
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state management and caching
- **UI Components**: Radix UI primitives with Tailwind CSS for consistent, accessible design
- **Graph Visualization**: D3.js for interactive network visualization with zoom, pan, and drag capabilities

### Backend Architecture
- **Express.js**: RESTful API server with middleware for logging, error handling, and file uploads
- **TypeScript**: Type-safe server-side development with shared schema validation
- **File Upload**: Multer middleware for handling document uploads with size limits
- **NLP Processing**: Compromise.js library for basic natural language processing and concept extraction
- **In-Memory Storage**: Fallback storage implementation using Maps for development/testing

### Data Storage Solutions
- **PostgreSQL**: Primary database using Drizzle ORM for type-safe database operations
- **Neon Database**: Serverless PostgreSQL hosting for scalable cloud deployment
- **Schema Design**: 
  - Documents table for storing uploaded files and content
  - Nodes table for concepts/entities with position data for graph layout
  - Relationships table for connections between nodes with strength scoring
  - Queries table for storing search history and results

### Authentication and Authorization
- Currently no authentication system implemented
- Session-based authentication infrastructure prepared with connect-pg-simple
- Ready for future implementation of user management and access controls

### External Dependencies
- **Neo4j GraphQL**: Prepared integration for advanced graph database operations
- **Compromise.js**: Natural language processing for concept extraction
- **D3.js**: Interactive graph visualization and force-directed layouts
- **Radix UI**: Accessible component primitives for consistent user interface
- **TanStack React Query**: Server state synchronization and caching
- **Tailwind CSS**: Utility-first styling with custom design system
- **Drizzle ORM**: Type-safe database operations with automatic migrations