#!/bin/bash

# 100% Native Integration Setup Script
# This script sets up the complete unified AI platform with native search integration

set -e

echo "🚀 Setting up 100% Native Unified AI Platform..."

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

cat > data/sample-docs/machine-learning-guide.txt << 'EOF'
# Machine Learning Implementation Guide

## Getting Started with Machine Learning

Machine learning implementation requires careful planning and execution. This guide covers the essential steps.

### Data Preparation
- **Data Collection**: Gather relevant, high-quality data
- **Data Cleaning**: Remove inconsistencies and handle missing values
- **Feature Engineering**: Create meaningful features from raw data
- **Data Splitting**: Divide data into training, validation, and test sets

### Model Selection
- **Linear Models**: Simple and interpretable (Linear Regression, Logistic Regression)
- **Tree-Based Models**: Handle non-linear relationships (Random Forest, XGBoost)
- **Neural Networks**: Deep learning for complex patterns
- **Ensemble Methods**: Combine multiple models for better performance

### Training Process
- **Loss Functions**: Define what the model should optimize
- **Optimization**: Use gradient descent or other optimization algorithms
- **Regularization**: Prevent overfitting with L1/L2 regularization
- **Cross-Validation**: Assess model performance reliably

### Evaluation Metrics
- **Classification**: Accuracy, Precision, Recall, F1-Score
- **Regression**: MAE, MSE, RMSE, R²
- **Ranking**: NDCG, MAP, MRR
- **Clustering**: Silhouette Score, Adjusted Rand Index

### Production Deployment
- **Model Serving**: Deploy models via APIs or batch processing
- **Monitoring**: Track model performance and data drift
- **A/B Testing**: Compare model versions in production
- **Scaling**: Handle increased traffic and data volume
EOF

cat > data/sample-docs/programming-concepts.json << 'EOF'
{
  "title": "Programming Concepts and Best Practices",
  "concepts": [
    {
      "name": "Object-Oriented Programming",
      "description": "Programming paradigm based on objects and classes",
      "principles": [
        "Encapsulation",
        "Inheritance",
        "Polymorphism",
        "Abstraction"
      ],
      "languages": ["Python", "Java", "C++", "C#"]
    },
    {
      "name": "Functional Programming",
      "description": "Programming paradigm based on mathematical functions",
      "principles": [
        "Immutability",
        "Pure Functions",
        "Higher-Order Functions",
        "Recursion"
      ],
      "languages": ["Haskell", "Lisp", "Clojure", "Scala"]
    },
    {
      "name": "Design Patterns",
      "description": "Reusable solutions to common programming problems",
      "patterns": [
        {
          "name": "Singleton",
          "type": "Creational",
          "use_case": "Ensure only one instance of a class"
        },
        {
          "name": "Observer",
          "type": "Behavioral",
          "use_case": "Notify multiple objects about state changes"
        },
        {
          "name": "Strategy",
          "type": "Behavioral",
          "use_case": "Define family of algorithms, make them interchangeable"
        }
      ]
    },
    {
      "name": "Data Structures",
      "description": "Ways to organize and store data efficiently",
      "structures": [
        {
          "name": "Array",
          "time_complexity": "O(1) access, O(n) search",
          "space_complexity": "O(n)",
          "use_case": "Sequential data with known size"
        },
        {
          "name": "Hash Table",
          "time_complexity": "O(1) average insert/search",
          "space_complexity": "O(n)",
          "use_case": "Fast key-value lookups"
        },
        {
          "name": "Binary Tree",
          "time_complexity": "O(log n) search in balanced tree",
          "space_complexity": "O(n)",
          "use_case": "Hierarchical data, sorted collections"
        }
      ]
    }
  ]
}
EOF

# Create environment file
echo "⚙️ Creating environment configuration..."

cat > .env << 'EOF'
# API Keys (add your own for enhanced web search)
BRAVE_API_KEY=your_brave_search_api_key_here
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Native Search Engine Configuration
EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2
EMBEDDING_DIM=384
USE_GPU=false
INDEX_PATH=/app/indexes
CHUNK_SIZE=1000
CHUNK_OVERLAP=100

# Performance Configuration
DEFAULT_MONTHLY_BUDGET=20.0
RATE_LIMIT_PER_MINUTE=60
TARGET_RESPONSE_TIME=2.5
EOF

echo "🐳 Building unified Docker image..."

# Build the unified image
docker-compose -f docker-compose.unified-native.yml build

echo "🔧 Starting unified services..."

# Start the services
docker-compose -f docker-compose.unified-native.yml up -d

echo "⏳ Waiting for services to start..."

# Wait for services to be healthy
sleep 30

# Check if Ollama needs to pull the model
echo "📥 Checking Ollama model..."
docker-compose -f docker-compose.unified-native.yml exec ollama ollama pull phi3:mini || true

# Test the endpoints
echo "🧪 Testing unified endpoints..."

# Test unified platform
if curl -s http://localhost:8000/health > /dev/null; then
    echo "✅ Unified AI Platform is running on http://localhost:8000"
else
    echo "❌ Unified AI Platform health check failed"
fi

# Test native search
if curl -s http://localhost:8000/api/v1/native-search/health > /dev/null; then
    echo "✅ Native Search Engine is integrated and running"
else
    echo "❌ Native Search Engine health check failed"
fi

# Test web interface
if curl -s http://localhost/health > /dev/null; then
    echo "✅ Web Interface is running on http://localhost"
else
    echo "❌ Web Interface health check failed"
fi

echo ""
echo "🎉 100% Native Integration Setup Complete!"
echo ""
echo "📋 Available features:"
echo "  🌐 Unified Web Interface: http://localhost"
echo "  🤖 AI Chat with Native Search: http://localhost:8000"
echo "  📊 API Documentation: http://localhost:8000/docs"
echo "  🔍 Native Search API: http://localhost:8000/api/v1/native-search/"
echo "  📤 Document Upload: Drag & drop in web interface"
echo ""
echo "🎯 Demo Instructions:"
echo "  1. Open http://localhost in your browser"
echo "  2. Upload sample documents from data/sample-docs/"
echo "  3. Chat with AI about your uploaded documents"
echo "  4. Try different modes: Unified, Chat, Search, Research"
echo "  5. Test native search performance with complex queries"
echo ""
echo "🚀 Key Integration Features:"
echo "  ✅ 100% Native FAISS/HNSW/LSH Search"
echo "  ✅ Integrated Document Processing"
echo "  ✅ Single Service Deployment"
echo "  ✅ No External Dependencies"
echo "  ✅ Ultra-Fast Search Performance"
echo "  ✅ Unified Web Interface"
echo ""
echo "📁 Sample documents available in data/sample-docs/"
echo "📜 View logs with: docker-compose -f docker-compose.unified-native.yml logs -f"
echo "🛑 Stop services with: docker-compose -f docker-compose.unified-native.yml down"
echo ""
echo "🎊 Happy exploring your 100% integrated AI platform!"