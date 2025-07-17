#!/bin/bash

# Demo Setup Script for Unified AI Platform
# This script sets up the complete demo environment

set -e

echo "🚀 Setting up Unified AI Platform Demo..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p data/sample-docs
mkdir -p indexes
mkdir -p logs

# Create sample documents for demo
echo "📄 Creating sample documents..."

cat > data/sample-docs/ai-research.txt << 'EOF'
# Artificial Intelligence Research Overview

## Machine Learning Fundamentals

Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed. Key concepts include:

- **Supervised Learning**: Training models with labeled data
- **Unsupervised Learning**: Finding patterns in unlabeled data  
- **Reinforcement Learning**: Learning through interaction with environment

## Deep Learning

Deep learning uses neural networks with multiple layers to model complex patterns:

- **Convolutional Neural Networks (CNNs)**: Excellent for image processing
- **Recurrent Neural Networks (RNNs)**: Great for sequential data
- **Transformers**: Revolutionary architecture for language processing

## Natural Language Processing

NLP focuses on enabling computers to understand and generate human language:

- **Tokenization**: Breaking text into meaningful units
- **Embeddings**: Converting words to numerical representations
- **Attention Mechanisms**: Focusing on relevant parts of input

## Applications

AI is being applied across numerous domains:

- Healthcare: Medical diagnosis and drug discovery
- Finance: Fraud detection and algorithmic trading
- Transportation: Autonomous vehicles and route optimization
- Entertainment: Content recommendation and game AI
EOF

cat > data/sample-docs/python-guide.txt << 'EOF'
# Python Programming Guide

## Getting Started

Python is a high-level, interpreted programming language known for its simplicity and readability.

### Installation
```bash
# Install Python using package manager
sudo apt-get install python3 python3-pip

# Or download from python.org
```

### Basic Syntax
```python
# Variables
name = "Alice"
age = 30
height = 5.6

# Functions
def greet(name):
    return f"Hello, {name}!"

# Classes
class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age
    
    def introduce(self):
        return f"I'm {self.name}, {self.age} years old"
```

## Data Structures

### Lists
```python
fruits = ["apple", "banana", "orange"]
fruits.append("grape")
fruits.remove("banana")
```

### Dictionaries
```python
person = {
    "name": "Bob",
    "age": 25,
    "city": "New York"
}
```

### Sets
```python
unique_numbers = {1, 2, 3, 4, 5}
unique_numbers.add(6)
```

## Libraries and Frameworks

### Data Science
- **NumPy**: Numerical computing
- **Pandas**: Data manipulation
- **Matplotlib**: Plotting and visualization
- **Scikit-learn**: Machine learning

### Web Development
- **Flask**: Lightweight web framework
- **Django**: Full-featured web framework
- **FastAPI**: Modern API framework

### AI/ML
- **TensorFlow**: Deep learning framework
- **PyTorch**: Dynamic neural networks
- **Hugging Face**: Pre-trained models
EOF

cat > data/sample-docs/database-concepts.json << 'EOF'
{
  "title": "Database Fundamentals",
  "topics": [
    {
      "name": "Relational Databases",
      "description": "Structured data storage using tables with relationships",
      "technologies": ["MySQL", "PostgreSQL", "SQLite", "Oracle"],
      "concepts": [
        "ACID properties",
        "Normalization",
        "Indexing",
        "Constraints"
      ]
    },
    {
      "name": "NoSQL Databases",
      "description": "Non-relational databases for flexible data storage",
      "types": [
        {
          "type": "Document",
          "examples": ["MongoDB", "CouchDB"],
          "use_cases": ["Content management", "Catalogs"]
        },
        {
          "type": "Key-Value",
          "examples": ["Redis", "DynamoDB"],
          "use_cases": ["Caching", "Session storage"]
        },
        {
          "type": "Column-Family",
          "examples": ["Cassandra", "HBase"],
          "use_cases": ["Time-series data", "Analytics"]
        },
        {
          "type": "Graph",
          "examples": ["Neo4j", "Amazon Neptune"],
          "use_cases": ["Social networks", "Recommendation engines"]
        }
      ]
    },
    {
      "name": "Database Design",
      "principles": [
        "Identify entities and relationships",
        "Choose appropriate data types",
        "Design for scalability",
        "Consider query patterns",
        "Implement proper indexing"
      ]
    }
  ]
}
EOF

# Create environment file
echo "⚙️ Creating environment configuration..."

cat > .env << 'EOF'
# API Keys (add your own for full functionality)
BRAVE_API_KEY=your_brave_search_api_key_here
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key_here

# Optional: OpenAI API key for enhanced chat
OPENAI_API_KEY=your_openai_api_key_here

# Database configuration (if using external services)
CLICKHOUSE_URL=
POSTGRES_URL=
EOF

echo "🐳 Building Docker images..."

# Build the images
docker-compose -f docker-compose.demo.yml build

echo "🔧 Starting services..."

# Start the services
docker-compose -f docker-compose.demo.yml up -d

echo "⏳ Waiting for services to start..."

# Wait for services to be healthy
sleep 30

# Check if Ollama needs to pull the model
echo "📥 Checking Ollama model..."
docker-compose -f docker-compose.demo.yml exec ollama ollama pull phi3:mini || true

# Test the endpoints
echo "🧪 Testing endpoints..."

# Test AI platform
if curl -s http://localhost:8000/health > /dev/null; then
    echo "✅ AI Platform is running on http://localhost:8000"
else
    echo "❌ AI Platform health check failed"
fi

# Test search engine
if curl -s http://localhost:8001/health > /dev/null; then
    echo "✅ Search Engine is running on http://localhost:8001"
else
    echo "❌ Search Engine health check failed"
fi

# Test unified interface
if curl -s http://localhost/health > /dev/null; then
    echo "✅ Unified Interface is running on http://localhost"
else
    echo "❌ Unified Interface health check failed"
fi

echo ""
echo "🎉 Demo setup complete!"
echo ""
echo "📋 Available endpoints:"
echo "  🌐 Web Interface: http://localhost"
echo "  🤖 AI Platform API: http://localhost:8000"
echo "  🔍 Search Engine API: http://localhost:8001"
echo "  📊 API Documentation: http://localhost:8000/docs"
echo ""
echo "🎯 Demo Instructions:"
echo "  1. Open http://localhost in your browser"
echo "  2. Upload documents using the upload panel"
echo "  3. Chat with AI and search through documents"
echo "  4. Try different modes: Unified, Chat, Search, Research"
echo ""
echo "📁 Sample documents are available in data/sample-docs/"
echo "📜 View logs with: docker-compose -f docker-compose.demo.yml logs -f"
echo "🛑 Stop demo with: docker-compose -f docker-compose.demo.yml down"
echo ""
echo "🚀 Happy exploring!"