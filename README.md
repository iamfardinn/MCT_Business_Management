# MCT Business Management System

A comprehensive, offline-first desktop application designed for managing sub-dealer distribution, market sales, broadband subscriber billing, and daily cashbook operations. 

The system provides a robust administrative interface with fine-grained access control, real-time socket-based notifications for approval workflows, and extensive financial reporting capabilities. Data integrity is guaranteed via an integrated PostgreSQL database.

## Architecture

The system follows a modern, bundled architecture suitable for enterprise desktop deployments. It consists of the following tightly-coupled layers:

### 1. Presentation Layer (Frontend)
- **Framework:** React 18 with Vite
- **Language:** TypeScript
- **State Management:** Zustand (for global state and auth) and TanStack React Query (for server state and caching)
- **Styling:** Vanilla CSS with custom utility classes and design tokens for a cohesive, professional user interface.
- **Routing:** React Router v6
- **Charts:** Recharts for financial and sales visualization.

### 2. Application Server (Backend)
- **Framework:** Node.js with Express.js
- **Language:** TypeScript
- **Authentication:** JSON Web Tokens (JWT) for secure, stateless session management with Access and Refresh token rotation.
- **Real-time Communication:** Socket.IO for pushing real-time events (e.g., invoice approvals, rejections, and new submissions) from the server to connected admin clients.
- **Bundling:** Processed into a single optimized JavaScript file via ESBuild for seamless inclusion into the desktop wrapper.

### 3. Data Layer (Database)
- **Engine:** PostgreSQL
- **Driver:** `pg` (node-postgres)
- **Schema Management:** Custom SQL migration scripts ensuring version-controlled schema evolution and data consistency.
- **Features:** Relational integrity, check constraints, cascaded deletions, and UUID-based primary keys.

### 4. Desktop Wrapper (Electron)
- **Core:** Electron framework wrapping the presentation layer.
- **Process Management:** The backend application server is spawned automatically as an Electron `utilityProcess`. This guarantees that the Node.js backend starts and stops seamlessly with the desktop application lifecycle.
- **Packaging:** Electron Builder for generating zero-configuration `.exe` installers for Windows environments.

## Core Features

- **Invoice Management:** Comprehensive support for diverse invoice categories (e.g., general distribution, broadband services) with multi-tier approval workflows (Pending, Approved, Rejected).
- **Sub-dealer & Client Tracking:** Unified tracking of retailer outstanding balances, broadband subscriber running bills, and active connection statuses.
- **Cashbook & Expenses:** Daily transaction logs, income tracking, and expense recording with automated end-of-day balances.
- **Audit Logging:** System-wide audit trails capturing all Insert, Update, Delete, and Approval actions with actor traceability.
- **Advanced Reporting:** Exportable Excel reports for market sales, due lists, and cashbook summaries.

## Getting Started

### Prerequisites
- Node.js (v20 or higher)
- PostgreSQL (v14 or higher) running locally or remotely

### Installation

1. Clone the repository
2. Install dependencies across the workspace using pnpm:
   ```bash
   pnpm install
   ```
3. Configure the environment variables by creating `.env` files in the respective directories based on the provided examples.
4. Run the database migrations:
   ```bash
   cd database
   npm run migrate
   ```
5. Start the development environment (concurrently running frontend and backend):
   ```bash
   pnpm dev
   ```

### Packaging for Production
To build the standalone Windows executable installer:
```bash
cd desktop
npm run dist
```
The installer will be generated in the `desktop/dist` directory.
