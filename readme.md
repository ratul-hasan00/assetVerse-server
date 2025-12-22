# AssetVerse Server

**AssetVerse** is a corporate asset management system designed to help companies manage physical assets (laptops, keyboards, chairs, etc.) and track employee asset assignments efficiently. This repository contains the **backend server** built with **Node.js, Cors, Express, MongoDB, Firebase, and Stripe**.

# Live URL - https://asset-verse-server-mocha.vercel.app

## **Features**

- **User Authentication**  
  - Firebase Token Verification  
  - JWT-based authentication for login  
  - Role-based middleware (`HR` vs `Employee`)  

- **HR Management**  
  - Add, update, delete assets  
  - Approve/reject employee asset requests  
  - Upgrade subscription packages via Stripe  
  - Track employees in company  

- **Employee Management**  
  - View assigned assets  
  - Request new assets  
  - Auto-affiliation with company upon first asset approval  

- **Asset Management**  
  - CRUD operations for assets  
  - Track asset quantity and availability  
  - Return process for returnable assets  

- **Requests Management**  
  - Submit asset requests  
  - HR approval workflow  
  - Auto-assign assets to employees after approval  

- **Packages & Payments**  
  - Predefined packages with employee limits  
  - Stripe payment integration for upgrading packages  
  - Payment history tracking  

- **Analytics & Pagination**  
  - Server-side pagination for asset and employee lists  
  - Reports and summaries for HR dashboards  

---

## **Technologies Used**

- Node.js & Express.js  
- MongoDB (Atlas)  
- Firebase Admin SDK (Authentication)  
- JWT & bcrypt for authentication & password security  
- Stripe API for payments  
- CORS & Express JSON middleware  

---

## **API Endpoints**

### **User Authentication**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users` | Register HR or Employee |
| POST | `/login` | User login & JWT token |
| GET | `/users/:email` | Get user info |
| PUT | `/users/:email` | Update user info (name, photo) |

### **Assets**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/assets` | List all assets (pagination supported) |
| POST | `/assets` | HR-only: Add new asset |
| PUT | `/assets/:id` | HR-only: Update asset |
| DELETE | `/assets/:id` | HR-only: Delete asset |

### **Assigned Assets**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/assigned-assets` | Get assigned assets by employee email |
| PUT | `/assigned-assets/:id` | Return asset and update availability |

### **Employee Affiliations**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/employee-affiliations` | Get all active affiliations for employee |
| DELETE | `/employee-affiliation` | Remove employee from company |
| GET | `/company-employees` | Get all employees of a company |

### **Requests**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/requests` | Get requests by HR or employee |
| POST | `/requests` | Submit a new asset request |
| PUT | `/requests/:id` | Approve/Reject asset request |

### **Packages**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/packages` | Get all available subscription packages |

### **Payments (Stripe Integration)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/payments` | Get payment history by HR email |
| POST | `/create-checkout-session` | Create Stripe checkout session for package upgrade |

---

