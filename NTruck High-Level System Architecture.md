# NTruck High-Level System Architecture

## System Overview

NTruck is designed as a microservices-based logistics platform that connects truck drivers with shippers through a scalable, cloud-native architecture. The system follows a 3-tier architecture pattern with clear separation of concerns.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                                    │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────┤
│   Mobile Apps   │   Web Portal    │   Admin Panel   │   Third-party APIs  │
│  (React Native) │   (React.js)    │   (React.js)    │   (REST/GraphQL)    │
│                 │                 │                 │                     │
│ • Driver App    │ • Shipper Portal│ • Admin Dashboard│ • Partner Apps     │
│ • Shipper App   │ • Analytics     │ • User Management│ • External Services│
└─────────────────┴─────────────────┴─────────────────┴─────────────────────┘
                                    │
                                    │ HTTPS/WSS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION TIER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                            API Gateway                                      │
│                      (Kong/AWS API Gateway)                                 │
│                   • Authentication & Authorization                           │
│                   • Rate Limiting & Throttling                              │
│                   • Load Balancing                                          │
│                   • API Versioning                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MICROSERVICES LAYER                               │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────────┤
│ User        │ Marketplace │ Payment     │ Notification│ Analytics           │
│ Service     │ Service     │ Service     │ Service     │ Service             │
│ (Node.js)   │ (Node.js)   │ (Node.js)   │ (Node.js)   │ (Python/Node.js)    │
│             │             │             │             │                     │
│• Registration│• Load Mgmt  │• Payments   │• SMS/Email  │• Data Processing    │
│• Profile    │• Matching   │• Escrow     │• Push Notif │• Reporting          │
│• KYC        │• Booking    │• Invoicing  │• WhatsApp   │• ML Models          │
│• Auth       │• Tracking   │• Settlements│• In-app     │• Business Intel     │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             DATA TIER                                       │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────────┤
│ PostgreSQL  │   Redis     │  MongoDB    │Elasticsearch│   File Storage      │
│ (Primary)   │  (Cache)    │ (Analytics) │  (Search)   │   (AWS S3)          │
│             │             │             │             │                     │
│• User Data  │• Sessions   │• Logs       │• Load Search│• Documents          │
│• Bookings   │• Real-time  │• Analytics  │• Auto-complete│• Images           │
│• Payments   │• Pub/Sub    │• Metrics    │• Geo Search │• Reports            │
│• Loads      │• Job Queue  │• Events     │• Full-text  │• Backups            │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────────────┘
```

## Technology Stack

### Frontend Layer

#### Mobile Applications (React Native)
**Choice Rationale:**
- **Cross-platform Development**: Single codebase for iOS and Android
- **Native Performance**: Near-native performance with platform-specific optimizations
- **Large Developer Pool**: Extensive React Native expertise in India
- **Cost-Effective**: Faster development and maintenance compared to native apps

**Key Features:**
- Offline-first architecture with local data caching
- Real-time location tracking and updates
- Multi-language support (Hindi, English, regional languages)
- Biometric authentication integration
- Push notifications and background sync

#### Web Portal (React.js)
**Choice Rationale:**
- **Component Reusability**: Shared components with React Native via React Native Web
- **Rich Ecosystem**: Extensive library support and community
- **SEO Friendly**: Server-side rendering capabilities
- **Developer Experience**: Hot reloading, excellent debugging tools

**Features:**
- Responsive design for desktop and tablet
- Advanced analytics dashboards
- Bulk operations for enterprise users
- Real-time data visualization

### Backend Layer

#### API Gateway (Kong/AWS API Gateway)
**Responsibilities:**
- **Authentication & Authorization**: JWT token validation, OAuth integration
- **Rate Limiting**: Prevent API abuse and ensure fair usage
- **Load Balancing**: Distribute requests across service instances
- **API Versioning**: Manage multiple API versions
- **Monitoring**: Request logging, metrics collection

#### Microservices (Node.js with Express.js)
**Choice Rationale:**
- **JavaScript Ecosystem**: Shared language across frontend and backend
- **High Performance**: Event-driven, non-blocking I/O model
- **NPM Ecosystem**: Rich package repository
- **Rapid Development**: Fast prototyping and development cycles
- **Microservices Friendly**: Lightweight and scalable

#### Core Services Architecture:

```javascript
// Service Structure Example
const serviceStructure = {
  userService: {
    port: 3001,
    responsibilities: [
      'User registration and authentication',
      'Profile management',
      'KYC verification',
      'Document management'
    ],
    endpoints: [
      'POST /auth/register',
      'POST /auth/login',
      'GET /users/profile',
      'PUT /users/profile',
      'POST /users/documents'
    ]
  },
  marketplaceService: {
    port: 3002,
    responsibilities: [
      'Load posting and management',
      'Driver-load matching',
      'Booking management',
      'Real-time tracking'
    ],
    endpoints: [
      'POST /loads',
      'GET /loads/search',
      'POST /bookings',
      'GET /tracking/:bookingId'
    ]
  },
  paymentService: {
    port: 3003,
    responsibilities: [
      'Payment processing',
      'Escrow management',
      'Invoice generation',
      'Settlement processing'
    ],
    endpoints: [
      'POST /payments',
      'GET /payments/history',
      'POST /escrow/create',
      'POST /settlements/process'
    ]
  }
};
```

### Database Layer

#### PostgreSQL (Primary Database)
**Choice Rationale:**
- **ACID Compliance**: Ensures data consistency for financial transactions
- **JSON Support**: Native JSON data types for flexible schemas
- **Scalability**: Supports read replicas and horizontal scaling
- **Rich Feature Set**: Advanced indexing, full-text search, spatial data support

**Schema Design:**
```sql
-- Key Tables Structure
users (
  id UUID PRIMARY KEY,
  mobile_number VARCHAR(15) UNIQUE,
  user_type ENUM('driver', 'shipper', 'admin'),
  profile_data JSONB,
  verification_status ENUM('pending', 'verified', 'rejected'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

loads (
  id UUID PRIMARY KEY,
  shipper_id UUID REFERENCES users(id),
  source_location POINT,
  destination_location POINT,
  load_details JSONB,
  status ENUM('posted', 'matched', 'in_transit', 'delivered'),
  created_at TIMESTAMP
);

bookings (
  id UUID PRIMARY KEY,
  load_id UUID REFERENCES loads(id),
  driver_id UUID REFERENCES users(id),
  booking_status ENUM('confirmed', 'in_progress', 'completed'),
  payment_status ENUM('pending', 'escrowed', 'released'),
  created_at TIMESTAMP
);
```

#### Redis (Caching & Real-time)
**Use Cases:**
- **Session Management**: User session storage and validation
- **Real-time Data**: Live location updates, notifications
- **Caching**: Frequently accessed data, API responses
- **Job Queue**: Background task processing with Bull Queue
- **Pub/Sub**: Real-time communication between services

#### MongoDB (Analytics & Logs)
**Choice Rationale:**
- **Flexible Schema**: Perfect for event logs and analytics data
- **Horizontal Scaling**: Sharding support for large datasets
- **Aggregation Pipeline**: Complex analytics queries
- **Time-series Data**: Optimized for time-based analytics

#### Elasticsearch (Search Engine)
**Features:**
- **Fuzzy Search**: Intelligent load matching
- **Geo-spatial Search**: Location-based queries
- **Auto-complete**: Real-time search suggestions
- **Full-text Search**: Advanced search across multiple fields

## Component Interactions

### Request Flow Architecture

```
┌─────────────┐    1. Request    ┌─────────────┐
│ Mobile App  │ ──────────────→ │ API Gateway │
└─────────────┘                  └─────────────┘
                                       │
                                 2. Auth Check
                                       ▼
┌─────────────┐    3. Route      ┌─────────────┐    4. Process    ┌─────────────┐
│   Redis     │ ←──────────────  │   Service   │ ──────────────→ │ PostgreSQL  │
│  (Cache)    │    Session       │  (Node.js)  │    Query        │ (Database)  │
└─────────────┘                  └─────────────┘                  └─────────────┘
                                       │
                                 5. Response
                                       ▼
┌─────────────┐    6. Update     ┌─────────────┐
│   Client    │ ←──────────────  │   Gateway   │
│ (Real-time) │   WebSocket      │             │
└─────────────┘                  └─────────────┘
```

### Data Flow Patterns

#### 1. Real-time Location Updates
```
Driver App → WebSocket → API Gateway → Marketplace Service → Redis Pub/Sub → Shipper App
```

#### 2. Payment Processing
```
Payment Request → Payment Service → Razorpay API → Escrow Account → Settlement Service → Driver Account
```

#### 3. Load Matching Algorithm
```
Load Posted → Elasticsearch Index → ML Matching Service → Driver Notifications → Real-time Updates
```

## Service Communication

### Synchronous Communication (HTTP/REST)
- **User Management**: Authentication, profile updates
- **Booking Operations**: Load creation, booking confirmation
- **Payment Processing**: Transaction initiation, status updates

### Asynchronous Communication (Message Queue)
- **Event-driven Architecture**: Order processing, status updates
- **Background Jobs**: Document verification, analytics processing
- **Notifications**: SMS, email, push notifications

### Message Queue Implementation (Redis/Bull)
```javascript
// Job Queue Example
const Queue = require('bull');
const emailQueue = new Queue('email queue', 'redis://127.0.0.1:6379');

// Producer
emailQueue.add('welcome email', {
  userId: '123',
  email: 'user@example.com',
  template: 'welcome'
});

// Consumer
emailQueue.process('welcome email', async (job) => {
  const { userId, email, template } = job.data;
  await sendEmail(email, template, { userId });
});
```

## Scalability & Performance

### Horizontal Scaling Strategy
- **API Gateway**: Load balancer with multiple instances
- **Microservices**: Auto-scaling based on CPU/memory usage
- **Database**: Read replicas for query distribution
- **Caching**: Redis Cluster for high availability

### Performance Optimization
- **CDN Integration**: Static asset delivery via CloudFlare
- **Database Indexing**: Optimized queries with proper indexes
- **Connection Pooling**: Efficient database connection management
- **Lazy Loading**: On-demand data loading in mobile apps

### Monitoring & Observability
```javascript
// Monitoring Stack
const monitoring = {
  applicationMonitoring: 'New Relic / DataDog',
  logAggregation: 'ELK Stack (Elasticsearch, Logstash, Kibana)',
  metrics: 'Prometheus + Grafana',
  errorTracking: 'Sentry',
  uptime: 'Pingdom / UptimeRobot'
};
```

## Security Architecture

### Authentication Flow
```
1. User Login → JWT Token Generation
2. Token Verification → API Gateway
3. Role-based Authorization → Service Level
4. Session Management → Redis Store
```

### Data Protection
- **Encryption at Rest**: Database encryption, file storage encryption
- **Encryption in Transit**: HTTPS/TLS for all communications
- **PII Protection**: Data anonymization, GDPR compliance
- **Audit Logging**: Complete activity tracking

### Security Measures
```javascript
// Security Implementation
const security = {
  authentication: 'JWT with refresh tokens',
  authorization: 'Role-based access control (RBAC)',
  dataEncryption: 'AES-256 encryption',
  apiSecurity: 'Rate limiting, input validation',
  compliance: 'PCI DSS, GDPR ready'
};
```

## Deployment Architecture

### Container Strategy (Docker + Kubernetes)
```yaml
# Kubernetes Deployment Example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
      - name: user-service
        image: ntruck/user-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
```

### Infrastructure as Code (Terraform)
```hcl
# AWS Infrastructure
resource "aws_eks_cluster" "ntruck_cluster" {
  name     = "ntruck-production"
  role_arn = aws_iam_role.cluster.arn
  version  = "1.24"

  vpc_config {
    subnet_ids = [
      aws_subnet.private_1.id,
      aws_subnet.private_2.id
    ]
  }
}
```

## Third-party Integrations

### Essential Integrations
```javascript
const integrations = {
  payments: {
    primary: 'Razorpay',
    backup: 'PayU',
    features: ['UPI', 'Cards', 'Net Banking', 'Wallets']
  },
  maps: {
    navigation: 'Google Maps API',
    geocoding: 'MapMyIndia',
    routing: 'OSRM'
  },
  communication: {
    sms: 'MSG91',
    email: 'SendGrid',
    push: 'Firebase Cloud Messaging',
    whatsapp: 'Twilio WhatsApp API'
  },
  verification: {
    kyc: 'Aadhaar eKYC API',
    documents: 'DigiLocker',
    background: 'Third-party verification services'
  }
};
```

## Development & Deployment Pipeline

### CI/CD Pipeline
```yaml
# GitHub Actions Pipeline
name: NTruck CI/CD
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run lint
  
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Build Docker image
        run: docker build -t ntruck/api:${{ github.sha }} .
      - name: Push to registry
        run: docker push ntruck/api:${{ github.sha }}
  
  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Kubernetes
        run: kubectl set image deployment/api api=ntruck/api:${{ github.sha }}
```

This architecture provides a robust, scalable foundation for NTruck's logistics platform, ensuring high availability, performance, and security while maintaining the flexibility to evolve with business requirements.
