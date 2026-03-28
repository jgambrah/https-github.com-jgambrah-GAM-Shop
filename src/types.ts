export type UserRole = 
  | 'manager'      // Store Manager / General Manager
  | 'supervisor'   // Floor Supervisor / Department Manager
  | 'clerk'        // Cashier / Sales Clerk
  | 'inventory'    // Stock Controller / Inventory Manager
  | 'accountant'   // Accountant / Auditor
  | 'security'     // Security Personnel
  | 'warehouse'    // Warehouse Staff / Loader
  | 'service';     // Customer Service / Reception

export interface BusinessUnit {
  id: string;
  name: string;
  tin?: string;
  location?: string;
  ownerUid: string;
  createdAt: string;
  trialEndsAt: string;
  subscriptionStatus: 'trialing' | 'active' | 'expired';
  selectedPlanId?: string;
  paymentReference?: string;
  vatRate?: number;
  updatedAt?: string;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  businessUnitId: string;
  branchId: string;
  ghanaCard?: string;
  phone?: string;
  address?: string;
  emergencyContact?: string;
  createdAt: string;
}

export interface BundleItem {
  templateId: string;
  quantity: number;
}

export interface ProductTemplate {
  id: string;
  businessUnitId: string;
  name: string;
  sku: string;
  barcode?: string;
  brand?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  unit?: string; // e.g., Pcs, Box, Sachet, Kg
  costPrice?: number;
  sellingPrice?: number;
  isBundle?: boolean;
  bundleItems?: BundleItem[];
  createdAt: string;
}

export interface Product {
  id: string;
  businessUnitId: string;
  templateId: string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  category: string;
  unit: string;
  batchNumber?: string;
  price: number;
  costPrice: number;
  stockLevel: number;
  reorderPoint: number;
  expiryDate: string;
  location: string;
  branchId: string;
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  discount?: number;
  discountType?: 'fixed' | 'percentage';
  total: number;
}

export interface Sale {
  id: string;
  businessUnitId: string;
  items: SaleItem[];
  subtotal: number;
  discount?: number;
  discountType?: 'fixed' | 'percentage';
  total: number;
  tax: number;
  paymentMethod: 'cash' | 'card' | 'momo' | 'credit' | 'cheque';
  momoReference?: string;
  momoNetwork?: 'mtn' | 'vodafone' | 'airteltigo';
  momoPhone?: string;
  clerkId: string;
  clerkName: string;
  branchId: string;
  shiftId: string;
  customerId?: string;
  customerPhone?: string;
  timestamp: string;
  status: 'completed' | 'refunded';
  refundedAt?: string;
  refundedBy?: string;
  refundReason?: string;
}

export interface Customer {
  id: string;
  businessUnitId: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  creditLimit: number;
  currentBalance: number; // Positive means they owe us
  createdAt: string;
  updatedAt: string;
}

export interface CustomerLedgerEntry {
  id: string;
  customerId: string;
  businessUnitId: string;
  type: 'sale' | 'payment' | 'refund';
  amount: number;
  balanceAfter: number;
  referenceId?: string; // saleId or paymentId
  paymentMethod?: 'cash' | 'card' | 'momo' | 'cheque';
  shiftId?: string;
  note?: string;
  timestamp: string;
  clerkId: string;
}

export interface Shift {
  id: string;
  displayId: string;
  businessUnitId: string;
  userId: string;
  userName: string;
  startTime: string;
  endTime?: string;
  openingCash: number;
  closingCash?: number; // Cashier's count at submission
  expectedCash?: number; // System's count
  status: 'open' | 'submitted' | 'closed';
  branchId: string;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
}

export interface Category {
  id: string;
  businessUnitId: string;
  name: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  features: string[];
  isPopular?: boolean;
  updatedAt: string;
}

export interface DemoRequest {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  status: 'pending' | 'provisioned' | 'rejected';
  createdAt: string;
}

export interface Branch {
  id: string;
  businessUnitId: string;
  name: string;
  location: string;
  managerId?: string;
  type: 'store' | 'warehouse';
}

export interface StockTransfer {
  id: string;
  businessUnitId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  productId: string; // The product ID in the source branch
  templateId: string; // To link correctly in the destination
  productName: string;
  quantity: number;
  status: 'pending' | 'in-transit' | 'received' | 'cancelled';
  initiatedBy: string;
  initiatedAt: string;
  receivedBy?: string;
  receivedAt?: string;
  notes?: string;
}
