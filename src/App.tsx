import * as React from 'react';
import { useState, useEffect, useMemo, Component } from 'react';
import Papa from 'papaparse';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  BarChart3, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  Plus, 
  Minus,
  Lock,
  Search, 
  Trash2, 
  CreditCard, 
  Smartphone, 
  Banknote,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  Printer,
  History,
  Archive,
  Eye,
  Store,
  MapPin,
  Tag,
  ShieldCheck,
  Check,
  Send,
  Calendar,
  Zap,
  Unlock,
  ArrowRightLeft,
  BookOpen,
  Camera,
  Phone,
  CreditCard as IdCard,
  MapPin as AddressIcon,
  Scan,
  Sparkles,
  MessageSquare,
  Bot,
  WifiOff,
  CheckCircle2,
  Loader2,
  Upload,
  Edit3,
  ArrowRight,
  Clock,
  FileText,
  RefreshCcw
} from 'lucide-react';
import Markdown from 'react-markdown';
import { getBusinessInsights } from './services/geminiService';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  where, 
  serverTimestamp,
  orderBy,
  limit,
  getDoc,
  setDoc,
  deleteDoc,
  runTransaction
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { usePaystackPayment } from 'react-paystack';
import { generateReceiptPDF, generateInvoicePDF, generateShiftReportPDF } from './lib/pdfUtils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import { format, subDays } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { logEvent } from './lib/analytics';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '0.00';
  }
  return amount.toFixed(2);
}

const formatSaleId = (date: string, count: number) => {
  const datePart = date.replace(/-/g, '').slice(2); // YYMMDD
  const countPart = count.toString().padStart(4, '0'); // 0001
  return `S-${datePart}-${countPart}`;
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  
  // Ignore permission errors if user is not logged in (likely a logout race condition)
  if (message.includes('Missing or insufficient permissions') && !auth.currentUser) {
    console.warn(`Firestore permission error during logout/unauthenticated state for ${path}`);
    return;
  }

  logEvent({ type: 'error', message, stack });

  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    const { getDocFromServer } = await import('firebase/firestore');
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
      toast.error("Firebase is offline. Please check your connection.");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong while rendering the application.";
      let errorDetail = "";
      
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error && parsed.operationType) {
          errorMessage = `Database Error: ${parsed.operationType} failed.`;
          errorDetail = parsed.error;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      // Check for common errors
      if (errorMessage.includes('toFixed')) {
        errorMessage = "A numeric formatting error occurred.";
        errorDetail = "This usually happens when a calculation results in an undefined value. We've implemented safeguards, but some legacy data might still trigger this.";
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center space-y-6 border border-slate-100">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
              <AlertCircle size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Oops!</h2>
              <p className="text-slate-600 font-medium">{errorMessage}</p>
              {errorDetail && (
                <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                  {errorDetail}
                </p>
              )}
            </div>
            <div className="pt-4 space-y-3">
              <Button 
                onClick={() => window.location.reload()} 
                className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl shadow-xl shadow-orange-200 transition-all active:scale-95"
              >
                Reload Application
              </Button>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                If the problem persists, please contact support.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Types ---
import { User, Product, ProductTemplate, Sale, Shift, Category, Branch, SaleItem, UserRole, BusinessUnit, DemoRequest, PricingPlan, StockTransfer, BundleItem, Customer, CustomerLedgerEntry } from './types';

// --- Components ---

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick 
}: { 
  icon: any, 
  label: string, 
  active: boolean, 
  onClick: () => void 
}) => (
  <motion.button
    whileHover={{ x: 4 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all duration-200",
      active 
        ? "bg-orange-500 text-white shadow-lg shadow-orange-200" 
        : "text-slate-600 hover:bg-orange-50 hover:text-orange-600"
    )}
  >
    <Icon size={20} />
    <span className="font-bold text-sm uppercase tracking-wider">{label}</span>
  </motion.button>
);

const Card = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn("bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-shadow hover:shadow-md", className)} 
    {...(props as any)}
  >
    {children}
  </motion.div>
);

const Button = ({ 
  children, 
  variant = 'primary', 
  className, 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' }) => {
  const variants = {
    primary: "bg-orange-500 text-white hover:bg-orange-600 shadow-sm",
    secondary: "bg-slate-900 text-white hover:bg-black shadow-sm",
    outline: "border-2 border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-slate-200",
    danger: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
    ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
  };
  
  return (
    <motion.button 
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-wider",
        variants[variant],
        className
      )}
      {...(props as any)}
    >
      {children}
    </motion.button>
  );
};

// --- Modules ---

const Staff = ({ users, branches, onAddStaff, onUpdateStaff, onDeleteStaff }: { 
  users: User[], 
  branches: Branch[], 
  onAddStaff: (u: Partial<User>) => void, 
  onUpdateStaff: (uid: string, data: Partial<User>) => void,
  onDeleteStaff: (uid: string) => void
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (editingUser) {
      setPhotoPreview(editingUser.photoURL || null);
    } else {
      setPhotoPreview(null);
    }
  }, [editingUser]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-slate-800">Staff Management</h3>
        <Button onClick={() => setIsAdding(true)}>
          <Plus size={20} />
          Add Staff
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Staff</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ghana Card</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Users size={20} className="text-slate-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{u.displayName}</div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Joined {format(new Date(u.createdAt), 'MMM yyyy')}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-600">{u.email}</div>
                    <div className="text-xs text-slate-400">{u.phone || 'No phone'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                    {u.ghanaCard || 'Not Provided'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      u.role === 'manager' && "bg-purple-100 text-purple-700",
                      u.role === 'supervisor' && "bg-indigo-100 text-indigo-700",
                      u.role === 'clerk' && "bg-blue-100 text-blue-700",
                      u.role === 'inventory' && "bg-emerald-100 text-emerald-700",
                      u.role === 'accountant' && "bg-amber-100 text-amber-700",
                      u.role === 'security' && "bg-slate-100 text-slate-700",
                      u.role === 'warehouse' && "bg-orange-100 text-orange-700",
                      u.role === 'service' && "bg-rose-100 text-rose-700"
                    )}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 capitalize">
                    {branches.find(b => b.id === u.branchId)?.name || u.branchId}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => setEditingUser(u)}
                        className="p-2 text-slate-400 hover:text-orange-500 transition-colors"
                      >
                        <Settings size={18} />
                      </button>
                      <button 
                        onClick={() => setUserToDelete(u)}
                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AnimatePresence>
        {userToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Staff Member?</h3>
                <p className="text-slate-500 mb-6">
                  Are you sure you want to delete <span className="font-bold text-slate-800">{userToDelete.displayName}</span>? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setUserToDelete(null)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => {
                      onDeleteStaff(userToDelete.uid);
                      setUserToDelete(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {(isAdding || editingUser) && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-xl font-bold text-slate-800">
                  {editingUser ? 'Edit Staff Member' : 'Add Staff Member'}
                </h3>
                <button 
                  onClick={() => {
                    setIsAdding(false);
                    setEditingUser(null);
                    setPhotoPreview(null);
                  }} 
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={24} />
                </button>
              </div>
              <form 
                className="p-6 space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const data: Partial<User> = {
                    displayName: formData.get('name') as string,
                    email: formData.get('email') as string,
                    role: formData.get('role') as UserRole,
                    branchId: formData.get('branchId') as string,
                    ghanaCard: formData.get('ghanaCard') as string,
                    phone: formData.get('phone') as string,
                    address: formData.get('address') as string,
                    emergencyContact: formData.get('emergencyContact') as string,
                    photoURL: photoPreview || undefined
                  };

                  if (editingUser) {
                    onUpdateStaff(editingUser.uid, data);
                  } else {
                    onAddStaff(data);
                  }
                  
                  setIsAdding(false);
                  setEditingUser(null);
                  setPhotoPreview(null);
                }}
              >
                <div className="flex flex-col md:flex-row gap-8">
                  {/* Photo Upload Section */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-32 h-32 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group">
                      {photoPreview ? (
                        <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Camera size={32} className="text-slate-300" />
                      )}
                      <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                        <span className="text-white text-xs font-bold">Change Photo</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                      </label>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center max-w-[120px]">Upload a clear profile picture</p>
                  </div>

                  {/* Form Fields Section */}
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                        <input 
                          name="name" 
                          required 
                          defaultValue={editingUser?.displayName}
                          className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                        <input 
                          name="email" 
                          type="email" 
                          required 
                          defaultValue={editingUser?.email}
                          className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Ghana Card Number</label>
                        <input 
                          name="ghanaCard" 
                          placeholder="GHA-000000000-0"
                          defaultValue={editingUser?.ghanaCard}
                          className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Phone Number</label>
                        <input 
                          name="phone" 
                          type="tel"
                          defaultValue={editingUser?.phone}
                          className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Role</label>
                        <select 
                          name="role" 
                          defaultValue={editingUser?.role || 'clerk'}
                          className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500"
                        >
                          <option value="clerk">Cashier / Clerk</option>
                          <option value="manager">Store Manager</option>
                          <option value="supervisor">Floor Supervisor</option>
                          <option value="inventory">Stock Controller</option>
                          <option value="accountant">Accountant</option>
                          <option value="security">Security</option>
                          <option value="warehouse">Warehouse Staff</option>
                          <option value="service">Customer Service</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Branch</label>
                        <select 
                          name="branchId" 
                          defaultValue={editingUser?.branchId || 'main'}
                          className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500"
                        >
                          {branches.length > 0 ? branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          )) : (
                            <option value="main">Main Branch</option>
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Residential Address</label>
                      <textarea 
                        name="address" 
                        rows={2}
                        defaultValue={editingUser?.address}
                        className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500 resize-none" 
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Emergency Contact Info</label>
                      <input 
                        name="emergencyContact" 
                        placeholder="Name and Phone Number"
                        defaultValue={editingUser?.emergencyContact}
                        className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" 
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <Button type="submit" className="w-full py-4 text-lg">
                    {editingUser ? 'Update Staff Member' : 'Register New Staff'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Branches = ({ branches, users, onAddBranch }: { branches: Branch[], users: User[], onAddBranch: (b: Partial<Branch>) => void }) => {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">Branches & Warehouses</h3>
          <p className="text-slate-500 text-sm">Manage your physical locations and central hubs</p>
        </div>
        <Button onClick={() => setIsAdding(true)} className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-orange-200 flex items-center gap-2">
          <Plus size={20} />
          Add Location
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map(branch => {
          const manager = users.find(u => u.uid === branch.managerId) || 
                         users.find(u => u.branchId === branch.id && (u.role === 'manager' || u.role === 'supervisor'));
          return (
            <Card key={branch.id} className="p-6 hover:shadow-xl transition-all border-slate-100 group">
              <div className="flex items-start justify-between mb-4">
                <div className={cn(
                  "p-3 rounded-2xl group-hover:bg-orange-500 group-hover:text-white transition-colors",
                  branch.type === 'warehouse' ? "bg-blue-50 text-blue-500" : "bg-orange-50 text-orange-500"
                )}>
                  {branch.type === 'warehouse' ? <Archive size={24} /> : <Store size={24} />}
                </div>
                <span className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  branch.type === 'warehouse' ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                )}>
                  {branch.type}
                </span>
              </div>
              <h4 className="text-lg font-black text-slate-800 mb-1">{branch.name}</h4>
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-4">
                <MapPin size={14} />
                {branch.location}
              </div>
              
              <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                    <Users size={14} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Manager</p>
                    <p className="text-xs font-bold text-slate-700">{manager?.displayName || 'Not Assigned'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Staff</p>
                  <p className="text-xs font-bold text-slate-700">{users.filter(u => u.branchId === branch.id).length}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-xl font-bold text-slate-800">Add New Location</h3>
                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              <form 
                className="p-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  onAddBranch({
                    name: formData.get('name') as string,
                    location: formData.get('location') as string,
                    type: formData.get('type') as 'store' | 'warehouse',
                    managerId: formData.get('managerId') as string
                  });
                  setIsAdding(false);
                }}
              >
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Location Name</label>
                  <input name="name" required className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Physical Address</label>
                  <input name="location" required className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
                  <select name="type" required className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500">
                    <option value="store">Store / Branch</option>
                    <option value="warehouse">Warehouse / Central Hub</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Assign Manager</label>
                  <select name="managerId" className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500">
                    <option value="">-- No Manager --</option>
                    {users.filter(u => u.role === 'manager' || u.role === 'supervisor').map(u => (
                      <option key={u.uid} value={u.uid}>{u.displayName}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" className="w-full py-3 mt-4">Create Location</Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Receipt = ({ sale, businessUnit, branch, allBranches = [] }: { sale: Sale, businessUnit?: BusinessUnit | null, branch?: Branch, allBranches?: Branch[] }) => {
  const otherStores = allBranches.filter(b => b.type === 'store' && b.id !== branch?.id);
  
  return (
    <div className="p-8 bg-white text-black font-mono text-sm max-w-[300px] mx-auto border border-slate-200">
      <div className="text-center mb-4">
        <h2 className="font-bold text-lg uppercase">{businessUnit?.name || 'GAM SHOP'}</h2>
        <p className="font-bold">Location: {branch?.name || 'Main Branch'}</p>
        <p>{branch?.location || businessUnit?.location || 'Accra, Ghana'}</p>
        <p>TIN: {businessUnit?.tin || 'P0012345678'}</p>
      </div>
      <div className="border-t border-dashed border-black my-2" />
      <div className="space-y-1 mb-4">
        <p>Receipt: #{sale.id}</p>
        <p>Date: {format(new Date(sale.timestamp), 'dd/MM/yyyy HH:mm')}</p>
        <p>Till Operator: {sale.clerkName}</p>
        {sale.paymentMethod === 'momo' && (
          <div className="text-[10px] font-bold uppercase mt-1">
            <p>MoMo Network: {sale.momoNetwork || 'MTN'}</p>
            {sale.momoPhone && <p>MoMo Phone: {sale.momoPhone}</p>}
            {sale.momoReference && <p>MoMo Ref: {sale.momoReference}</p>}
          </div>
        )}
        {sale.customerPhone && !sale.momoPhone && (
          <p className="text-[10px] font-bold uppercase">Customer: {sale.customerPhone}</p>
        )}
      </div>
      <div className="border-t border-dashed border-black my-2" />
      <div className="space-y-2 mb-4">
        {sale.items.map((item, i) => {
          const itemTotal = item.total ?? (item.discountType === 'percentage' 
            ? item.subtotal * (1 - (item.discount || 0) / 100)
            : Math.max(0, item.subtotal - (item.discount || 0)));
          
          return (
            <div key={i} className="flex flex-col">
              <div className="flex justify-between">
                <div className="flex-1">
                  <p>{item.name}</p>
                  <p className="text-xs">{item.quantity} x {formatCurrency(item.price)}</p>
                </div>
                <p className="font-bold">{formatCurrency(itemTotal)}</p>
              </div>
              {item.discount ? (
                <p className="text-[10px] text-slate-500">
                  Discount: -{item.discountType === 'percentage' ? `${item.discount}%` : `GHC ${formatCurrency(item.discount)}`}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="border-t border-dashed border-black my-2" />
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(sale.subtotal || sale.total)}</span>
        </div>
        {sale.discount ? (
          <div className="flex justify-between text-xs">
            <span>Discount ({sale.discountType === 'percentage' ? `${sale.discount}%` : 'Fixed'})</span>
            <span>-{formatCurrency((sale.subtotal || sale.total) - (sale.total - sale.tax))}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>VAT ({businessUnit?.vatRate ?? 20}%)</span>
          <span>{formatCurrency(sale.tax)}</span>
        </div>
        <div className="flex justify-between font-bold text-lg">
          <span>TOTAL</span>
          <span>GHC {formatCurrency(sale.subtotal ? sale.total : (sale.total + sale.tax))}</span>
        </div>
      </div>
      <div className="border-t border-dashed border-black my-2" />
      
      {otherStores.length > 0 && (
        <div className="text-[10px] text-center mb-4 space-y-1">
          <p className="font-bold uppercase border-b border-black pb-1 mb-1">Our Other Locations</p>
          {otherStores.map(store => (
            <p key={store.id}>{store.name}: {store.location}</p>
          ))}
        </div>
      )}

      <div className="text-center mt-4 space-y-1">
        <p>Payment: {sale.paymentMethod.toUpperCase()}</p>
        <p className="text-xs">GRA E-VAT COMPLIANT</p>
        <p className="mt-4 font-bold">THANK YOU FOR YOUR BUSINESS!</p>
      </div>
    </div>
  );
};
const InventoryAlerts = ({ products, onNavigate }: { products: Product[], onNavigate: (tab: string) => void }) => {
  const now = new Date();
  const lowStock = products.filter(p => p.stockLevel <= p.reorderPoint);
  const expiringSoon = products.filter(p => {
    const expiry = new Date(p.expiryDate);
    const diff = expiry.getTime() - now.getTime();
    return diff > 0 && diff < (30 * 24 * 60 * 60 * 1000); // 30 days
  });
  const expired = products.filter(p => new Date(p.expiryDate) < now);
  const outOfStock = products.filter(p => p.stockLevel <= 0);

  const criticalCount = expired.length + outOfStock.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">Inventory Health</h3>
          <p className="text-slate-500 text-sm">Monitor stock levels and expiration dates</p>
        </div>
        {criticalCount > 0 && (
          <div className="px-4 py-2 bg-red-100 text-red-700 rounded-xl border border-red-200 flex items-center gap-2 animate-pulse">
            <AlertTriangle size={18} />
            <span className="text-sm font-black uppercase tracking-wider">{criticalCount} Critical Issues</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4 border-red-100 bg-red-50/10">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Package className="text-red-500" size={20} />
              Stock Alerts
            </h4>
            <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded-lg uppercase">
              {lowStock.length} Items
            </span>
          </div>
          
          <div className="space-y-2">
            {outOfStock.map(item => (
              <div key={item.id} className="p-4 bg-white rounded-xl border-2 border-red-500 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.name}</p>
                  <p className="text-xs text-red-600 font-black uppercase">OUT OF STOCK</p>
                </div>
                <Button variant="outline" onClick={() => onNavigate('inventory')} className="h-8 text-[10px] font-black uppercase px-3">Restock</Button>
              </div>
            ))}
            {lowStock.filter(p => p.stockLevel > 0).map(item => (
              <div key={item.id} className="p-4 bg-white rounded-xl border border-orange-200 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.name}</p>
                  <p className="text-xs text-orange-600 font-bold uppercase">Low Stock: {item.stockLevel} / {item.reorderPoint}</p>
                </div>
                <Button variant="outline" onClick={() => onNavigate('inventory')} className="h-8 text-[10px] font-black uppercase px-3">Update</Button>
              </div>
            ))}
            {lowStock.length === 0 && (
              <div className="text-center py-10 text-slate-400 italic text-sm">All stock levels are healthy</div>
            )}
          </div>
        </Card>

        <Card className="p-6 space-y-4 border-orange-100 bg-orange-50/10">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="text-orange-500" size={20} />
              Expiry Alerts
            </h4>
            <span className="px-2 py-1 bg-orange-100 text-orange-700 text-[10px] font-black rounded-lg uppercase">
              {expired.length + expiringSoon.length} Items
            </span>
          </div>

          <div className="space-y-2">
            {expired.map(item => (
              <div key={item.id} className="p-4 bg-white rounded-xl border-2 border-red-600 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.name}</p>
                  <p className="text-xs text-red-700 font-black uppercase">EXPIRED: {format(new Date(item.expiryDate), 'MMM dd, yyyy')}</p>
                </div>
                <Button variant="danger" onClick={() => onNavigate('inventory')} className="h-8 text-[10px] font-black uppercase px-3">Remove</Button>
              </div>
            ))}
            {expiringSoon.map(item => (
              <div key={item.id} className="p-4 bg-white rounded-xl border border-orange-300 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.name}</p>
                  <p className="text-xs text-orange-600 font-bold uppercase">Expiring in {Math.ceil((new Date(item.expiryDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))} days</p>
                </div>
                <Button variant="outline" onClick={() => onNavigate('inventory')} className="h-8 text-[10px] font-black uppercase px-3">Action</Button>
              </div>
            ))}
            {(expired.length === 0 && expiringSoon.length === 0) && (
              <div className="text-center py-10 text-slate-400 italic text-sm">No upcoming expirations</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

const Dashboard = ({ sales, products, onNavigate }: { sales: Sale[], products: Product[], onNavigate: (tab: string) => void }) => {
  const totalSales = sales.reduce((acc, s) => acc + (s.subtotal || s.total), 0);
  const totalItems = products.reduce((acc, p) => acc + p.stockLevel, 0);
  const lowStockItems = products.filter(p => p.stockLevel <= p.reorderPoint);
  const lowStockCount = lowStockItems.length;

  const now = new Date();
  const expiringSoon = products.filter(p => {
    const expiry = new Date(p.expiryDate);
    const diff = expiry.getTime() - now.getTime();
    return diff > 0 && diff < (30 * 24 * 60 * 60 * 1000); // 30 days
  });

  const topSelling = useMemo(() => {
    const counts: Record<string, { name: string, count: number, revenue: number }> = {};
    sales.forEach(s => {
      s.items.forEach(item => {
        if (!counts[item.productId]) {
          counts[item.productId] = { name: item.name, count: 0, revenue: 0 };
        }
        counts[item.productId].count += item.quantity;
        counts[item.productId].revenue += (item.total ?? item.subtotal);
      });
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [sales]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return format(d, 'MMM dd');
    }).reverse();

    return last7Days.map(day => {
      const daySales = sales.filter(s => format(new Date(s.timestamp), 'MMM dd') === day);
      return {
        name: day,
        sales: daySales.reduce((acc, s) => acc + (s.subtotal || s.total), 0)
      };
    });
  }, [sales]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 flex items-center gap-4">
          <div className="p-4 bg-orange-100 text-orange-600 rounded-2xl">
            <Banknote size={28} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Sales</p>
            <p className="text-2xl font-black text-slate-900">GHC {totalSales.toLocaleString()}</p>
          </div>
        </Card>
        <Card className="p-6 flex items-center gap-4">
          <div className="p-4 bg-blue-100 text-blue-600 rounded-2xl">
            <Package size={28} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Stock</p>
            <p className="text-2xl font-black text-slate-900">{totalItems.toLocaleString()}</p>
          </div>
        </Card>
        <Card className="p-6 flex items-center gap-4">
          <div className="p-4 bg-red-100 text-red-600 rounded-2xl">
            <AlertTriangle size={28} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Low Stock</p>
            <p className="text-2xl font-black text-slate-900">{lowStockCount}</p>
          </div>
        </Card>
        <Card className="p-6 flex items-center gap-4">
          <div className="p-4 bg-green-100 text-green-600 rounded-2xl">
            <ShoppingCart size={28} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Orders</p>
            <p className="text-2xl font-black text-slate-900">{sales.length}</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Sales Performance (Last 7 Days)</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={100}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="sales" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-6">Top Selling Products</h3>
              <div className="space-y-4">
                {topSelling.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10 italic">No sales data yet</p>
                ) : topSelling.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center font-black text-xs">
                        #{i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{p.name}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">{p.count} Units Sold</p>
                      </div>
                    </div>
                    <p className="text-sm font-black text-slate-800">₵{formatCurrency(p.revenue)}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-6">Recent Transactions</h3>
              <div className="space-y-4">
                {sales.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10 italic">No transactions yet</p>
                ) : sales.slice(0, 5).map(sale => (
                  <div key={sale.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-100 rounded-full">
                        <History size={16} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">Sale #{sale.id.slice(-6)}</p>
                        <p className="text-xs text-slate-500">{format(new Date(sale.timestamp), 'MMM dd, HH:mm')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">GHC {formatCurrency(sale.total)}</p>
                      <p className="text-xs text-slate-500 capitalize">
                        {sale.paymentMethod} {sale.momoNetwork && `(${sale.momoNetwork.toUpperCase()})`}
                      </p>
                      {sale.momoReference && (
                        <p className="text-[10px] text-slate-400 font-mono">Ref: {sale.momoReference}</p>
                      )}
                      {sale.momoPhone && (
                        <p className="text-[10px] text-slate-400 font-mono">Phone: {sale.momoPhone}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          {(lowStockCount > 0 || expiringSoon.length > 0) && (
            <Card className="p-6 border-red-100 bg-red-50/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-red-700 uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Critical Alerts
                </h3>
                <button 
                  onClick={() => onNavigate('alerts')}
                  className="text-[10px] font-black text-red-600 uppercase hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="space-y-3">
                {lowStockItems.slice(0, 3).map(item => (
                  <button 
                    key={item.id} 
                    onClick={() => onNavigate('inventory')}
                    className="w-full bg-white p-3 rounded-xl border border-red-100 flex items-center justify-between hover:bg-red-50 transition-colors text-left group"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-800">{item.name}</p>
                      <p className="text-[10px] text-red-500 font-black uppercase">Low Stock: {item.stockLevel}</p>
                    </div>
                    <div className="w-8 h-8 bg-red-50 text-red-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Package size={14} />
                    </div>
                  </button>
                ))}
                {expiringSoon.slice(0, 3).map(item => (
                  <button 
                    key={item.id} 
                    onClick={() => onNavigate('catalog')}
                    className="w-full bg-white p-3 rounded-xl border border-orange-100 flex items-center justify-between hover:bg-orange-50 transition-colors text-left group"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-800">{item.name}</p>
                      <p className="text-[10px] text-orange-500 font-black uppercase">Expires: {format(new Date(item.expiryDate), 'MMM dd')}</p>
                    </div>
                    <div className="w-8 h-8 bg-orange-50 text-orange-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Calendar size={14} />
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => onNavigate('pos')}
                className="flex items-center gap-3 p-3 bg-orange-50 text-orange-700 rounded-xl hover:bg-orange-100 transition-all text-left"
              >
                <div className="p-2 bg-orange-500 text-white rounded-lg">
                  <ShoppingCart size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold">New Sale</p>
                  <p className="text-[10px] opacity-70">Open POS terminal</p>
                </div>
              </button>
              <button 
                onClick={() => onNavigate('inventory')}
                className="flex items-center gap-3 p-3 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-all text-left"
              >
                <div className="p-2 bg-blue-500 text-white rounded-lg">
                  <Plus size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold">Add Product</p>
                  <p className="text-[10px] opacity-70">Update inventory</p>
                </div>
              </button>
              <button 
                onClick={() => onNavigate('reports')}
                className="flex items-center gap-3 p-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-all text-left"
              >
                <div className="p-2 bg-slate-800 text-white rounded-lg">
                  <BarChart3 size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold">View Reports</p>
                  <p className="text-[10px] opacity-70">Check performance</p>
                </div>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const GlobalOverview = ({ sales, products, branches }: { sales: Sale[], products: Product[], branches: Branch[] }) => {
  const totalSales = sales.reduce((acc, s) => acc + (s.subtotal || s.total), 0);
  const totalStock = products.reduce((acc, p) => acc + p.stockLevel, 0);
  const totalValue = products.reduce((acc, p) => acc + (p.stockLevel * p.price), 0);

  const branchStats = branches.map(branch => {
    const branchSales = sales.filter(s => s.branchId === branch.id);
    const branchProducts = products.filter(p => p.branchId === branch.id);
    const branchTotalSales = branchSales.reduce((acc, s) => acc + (s.subtotal || s.total), 0);
    const branchTotalStock = branchProducts.reduce((acc, p) => acc + p.stockLevel, 0);
    const branchTotalValue = branchProducts.reduce((acc, p) => acc + (p.stockLevel * p.price), 0);

    return {
      id: branch.id,
      name: branch.name,
      type: branch.type,
      sales: branchTotalSales,
      stock: branchTotalStock,
      value: branchTotalValue,
      orders: branchSales.length
    };
  });

  const warehouseStock = branchStats.filter(b => b.type === 'warehouse').reduce((acc, b) => acc + b.stock, 0);
  const storeStock = branchStats.filter(b => b.type === 'store').reduce((acc, b) => acc + b.stock, 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-gradient-to-br from-orange-500 to-orange-600 text-white border-none shadow-xl shadow-orange-100">
          <p className="text-xs font-bold uppercase opacity-80 mb-2">Global Total Sales</p>
          <p className="text-3xl font-black">GHC {totalSales.toLocaleString()}</p>
          <div className="mt-4 flex items-center gap-2 text-xs opacity-80">
            <ShoppingCart size={14} />
            {sales.length} Total Orders Across All Branches
          </div>
        </Card>
        <Card className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white border-none shadow-xl shadow-blue-100">
          <p className="text-xs font-bold uppercase opacity-80 mb-2">Global Total Stock</p>
          <p className="text-3xl font-black">{totalStock.toLocaleString()}</p>
          <div className="mt-4 flex items-center gap-2 text-xs opacity-80">
            <Package size={14} />
            {warehouseStock.toLocaleString()} in Warehouses, {storeStock.toLocaleString()} in Stores
          </div>
        </Card>
        <Card className="p-6 bg-gradient-to-br from-slate-800 to-slate-900 text-white border-none shadow-xl shadow-slate-200">
          <p className="text-xs font-bold uppercase opacity-80 mb-2">Global Inventory Value</p>
          <p className="text-3xl font-black">GHC {totalValue.toLocaleString()}</p>
          <div className="mt-4 flex items-center gap-2 text-xs opacity-80">
            <Archive size={14} />
            Estimated value of all goods in stock
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
            <Store size={20} className="text-orange-500" />
            Branch Performance
          </h3>
          <div className="space-y-4">
            {branchStats.sort((a, b) => b.sales - a.sales).map(stat => (
              <div key={stat.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-orange-200 transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      {stat.name}
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full uppercase",
                        stat.type === 'warehouse' ? "bg-blue-100 text-blue-600" : "bg-orange-100 text-orange-600"
                      )}>
                        {stat.type}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500">{stat.orders} Orders</p>
                  </div>
                  <p className="text-lg font-black text-slate-800">GHC {stat.sales.toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200/50">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Stock Level</p>
                    <p className="text-sm font-bold text-slate-700">{stat.stock.toLocaleString()} Units</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Stock Value</p>
                    <p className="text-sm font-bold text-slate-700">GHC {stat.value.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
            <BarChart3 size={20} className="text-blue-500" />
            Inventory Distribution
          </h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} width={100} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="stock" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Stock Units" />
                <Bar dataKey="sales" fill="#f97316" radius={[0, 4, 4, 0]} name="Sales Value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};

const ShiftManager = ({ 
  currentShift, 
  onOpenShift, 
  onCloseShift,
  sales,
  ledger,
  businessUnit,
  branches 
}: { 
  currentShift: Shift | null, 
  onOpenShift: (openingCash: number) => void, 
  onCloseShift: (closingCash: number, expectedCash: number) => void,
  sales: Sale[],
  ledger: CustomerLedgerEntry[],
  businessUnit: BusinessUnit | null | undefined,
  branches: Branch[]
}) => {
  const [openingCash, setOpeningCash] = useState(0);
  const [closingCash, setClosingCash] = useState(0);
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const shiftSales = useMemo(() => {
    if (!currentShift) return [];
    return sales.filter(s => s.shiftId === currentShift.id);
  }, [sales, currentShift]);

  const shiftPayments = useMemo(() => {
    if (!currentShift) return [];
    return ledger.filter(l => l.shiftId === currentShift.id && l.type === 'payment');
  }, [ledger, currentShift]);

  const expectedCash = useMemo(() => {
    if (!currentShift) return 0;
    const salesTotal = shiftSales
      .filter(s => s.paymentMethod === 'cash')
      .reduce((acc, s) => acc + s.total, 0);
    
    const paymentsTotal = shiftPayments
      .filter(p => p.paymentMethod === 'cash')
      .reduce((acc, p) => acc + p.amount, 0);

    return (currentShift.openingCash || 0) + salesTotal + paymentsTotal;
  }, [shiftSales, shiftPayments, currentShift]);

  if (!currentShift) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full"
        >
          <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mb-6">
            <Banknote size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">Open Your Till</h2>
          <p className="text-slate-500 mb-6 text-sm leading-relaxed">
            You must record your opening cash balance before you can start processing sales for this shift.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Opening Cash Balance (GHC)</label>
              <input 
                type="number" 
                min="0"
                step="0.01"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xl font-black text-slate-800 outline-none focus:border-orange-500 transition-all"
                value={openingCash}
                onChange={e => setOpeningCash(Math.max(0, Number(e.target.value)))}
              />
            </div>
            <Button 
              className="w-full py-4 text-lg"
              onClick={() => onOpenShift(openingCash)}
            >
              Open Shift
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (isClosing) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full"
        >
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-6">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">Close Your Till</h2>
          <p className="text-slate-500 mb-6 text-sm leading-relaxed">
            Count your cash and enter the total amount below. This will be submitted to your manager for review.
          </p>
          
          <div className="space-y-6">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
                <span>System Expected Cash</span>
                <span className="text-slate-800">GHC {formatCurrency(expectedCash)}</span>
              </div>
              <p className="text-[10px] text-slate-400">Includes opening balance + cash sales</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Actual Cash Counted (GHC)</label>
              <input 
                type="number" 
                min="0"
                step="0.01"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xl font-black text-slate-800 outline-none focus:border-orange-500 transition-all"
                value={closingCash}
                onChange={e => setClosingCash(Math.max(0, Number(e.target.value)))}
              />
            </div>
            
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setIsClosing(false)}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => onCloseShift(closingCash, expectedCash)}
              >
                Submit for Review
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 border-b border-slate-100 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="p-2 bg-green-100 text-green-600 rounded-lg">
          <Unlock size={20} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase">Shift ID: {currentShift.displayId || currentShift.id} | Status: OPEN</p>
          <p className="text-sm font-bold text-slate-800">Cashier: {currentShift.userName}</p>
          <p className="text-[10px] text-slate-400">Started at {format(new Date(currentShift.startTime), 'HH:mm')}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          className="border-slate-200 text-slate-600 flex items-center gap-2"
          onClick={() => generateShiftReportPDF(
            currentShift, 
            shiftSales, 
            shiftPayments, 
            businessUnit, 
            branches.find(b => b.id === currentShift.branchId),
            currentShift.userName
          )}
        >
          <Printer size={14} />
          Print Report
        </Button>
        <div className="text-right">
          <p className="text-xs font-bold text-slate-500 uppercase">Current Cash in Till</p>
          <p className="text-sm font-black text-orange-600">GHC {formatCurrency(expectedCash)}</p>
        </div>
        <Button 
          variant="outline" 
          className="text-red-600 border-red-100 hover:bg-red-50"
          onClick={() => setIsClosing(true)}
        >
          Close Till
        </Button>
      </div>
    </div>
  );
};

const ShiftReview = ({ 
  shifts, 
  users,
  onApproveShift,
  sales,
  ledger,
  businessUnit,
  branches
}: { 
  shifts: Shift[], 
  users: User[],
  onApproveShift: (shiftId: string, notes: string) => void,
  sales: Sale[],
  ledger: CustomerLedgerEntry[],
  businessUnit: BusinessUnit | null | undefined,
  branches: Branch[]
}) => {
  const [reviewingShift, setReviewingShift] = useState<Shift | null>(null);
  const [notes, setNotes] = useState('');

  const submittedShifts = shifts.filter(s => s.status === 'submitted');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-slate-800">Till Review & Approval</h3>
        <div className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold uppercase tracking-wider">
          {submittedShifts.length} Pending Review
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {submittedShifts.map(shift => {
          const user = users.find(u => u.uid === shift.userId);
          const variance = (shift.closingCash || 0) - (shift.expectedCash || 0);

          return (
            <Card key={shift.id} className="p-6">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                    <Users size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">{user?.displayName || 'Unknown User'}</h4>
                    <p className="text-xs text-slate-500">Shift ID: {shift.displayId || shift.id}</p>
                    <p className="text-[10px] text-slate-400">{format(new Date(shift.startTime), 'MMM dd, HH:mm')} - {shift.endTime ? format(new Date(shift.endTime), 'HH:mm') : 'N/A'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-8 flex-1 max-w-md">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Expected</p>
                    <p className="text-sm font-bold text-slate-800">GHC {formatCurrency(shift.expectedCash)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Actual</p>
                    <p className="text-sm font-bold text-slate-800">GHC {formatCurrency(shift.closingCash)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Variance</p>
                    <p className={cn(
                      "text-sm font-bold",
                      variance === 0 ? "text-green-600" : "text-red-600"
                    )}>
                      GHC {formatCurrency(variance)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline"
                    className="border-slate-200 text-slate-600"
                    onClick={() => {
                      const shiftSales = sales.filter(s => s.shiftId === shift.id);
                      const shiftPayments = ledger.filter(l => l.shiftId === shift.id && l.type === 'payment');
                      generateShiftReportPDF(
                        shift,
                        shiftSales,
                        shiftPayments,
                        businessUnit,
                        branches.find(b => b.id === shift.branchId),
                        user?.displayName || 'Unknown'
                      );
                    }}
                  >
                    <Printer size={14} />
                  </Button>
                  <Button 
                    onClick={() => setReviewingShift(shift)}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Review & Close
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}

        {submittedShifts.length === 0 && (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={24} />
            </div>
            <p className="text-slate-500 font-medium">All tills are currently reviewed and closed.</p>
          </div>
        )}
      </div>

      {reviewingShift && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full"
          >
            <h2 className="text-2xl font-black text-slate-800 mb-1">Finalize Till Closure</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Shift ID: {reviewingShift.displayId || reviewingShift.id}</p>
            
            <div className="space-y-4 mb-8">
              <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                <span className="text-slate-500">Expected Cash</span>
                <span className="font-bold text-slate-800">GHC {formatCurrency(reviewingShift.expectedCash)}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                <span className="text-slate-500">Actual Cash</span>
                <span className="font-bold text-slate-800">GHC {formatCurrency(reviewingShift.closingCash)}</span>
              </div>
              <div className="flex justify-between text-sm py-2">
                <span className="text-slate-500">Variance</span>
                <span className={cn(
                  "font-bold",
                  ((reviewingShift.closingCash || 0) - (reviewingShift.expectedCash || 0)) === 0 ? "text-green-600" : "text-red-600"
                )}>
                  GHC {formatCurrency((reviewingShift.closingCash || 0) - (reviewingShift.expectedCash || 0))}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Reviewer Notes</label>
                <textarea 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-orange-500 transition-all h-24"
                  placeholder="Add any observations or explanations for variance..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setReviewingShift(null);
                    setNotes('');
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    onApproveShift(reviewingShift.id, notes);
                    setReviewingShift(null);
                    setNotes('');
                  }}
                >
                  Approve & Close
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const POS = ({ products, productTemplates, onSaleComplete, currentShift, onOpenShift, onCloseShift, sales, businessUnit, customers, ledger, branches }: { 
  products: Product[], 
  productTemplates: ProductTemplate[],
  onSaleComplete: (sale: Partial<Sale>) => void, 
  currentShift: Shift | null,
  onOpenShift: (openingCash: number) => void,
  onCloseShift: (closingCash: number, expectedCash: number) => void,
  sales: Sale[],
  businessUnit?: BusinessUnit | null,
  customers: Customer[],
  ledger: CustomerLedgerEntry[],
  branches: Branch[]
}) => {
  const vatRate = businessUnit?.vatRate ?? 20;
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'momo' | 'credit'>('cash');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [momoReference, setMomoReference] = useState('');
  const [momoPhone, setMomoPhone] = useState('');
  const [momoNetwork, setMomoNetwork] = useState<'mtn' | 'vodafone' | 'airteltigo'>('mtn');
  const [momoStep, setMomoStep] = useState<'idle' | 'prompting' | 'verifying' | 'confirming'>('idle');
  const [isScanning, setIsScanning] = useState(false);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [cartDiscountType, setCartDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const lastScanRef = React.useRef<{ code: string, time: number } | null>(null);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    if (isScanning) {
      html5QrCode = new Html5Qrcode("qr-reader");
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          const now = Date.now();
          // Prevent duplicate scans of the same code within 2 seconds
          if (lastScanRef.current?.code === decodedText && now - lastScanRef.current.time < 2000) {
            return;
          }

          const product = products.find(p => p.barcode === decodedText || p.sku === decodedText);
          if (product) {
            addToCart(product, 1);
            toast.success(`Added ${product.name}`, { duration: 1500 });
            lastScanRef.current = { code: decodedText, time: now };
          } else {
            toast.error(`Unknown barcode: ${decodedText}`, { duration: 1500 });
            lastScanRef.current = { code: decodedText, time: now };
          }
        },
        () => {} // Ignore errors
      ).catch((err) => {
        console.error("Scanner error", err);
        toast.error("Failed to start camera");
        setIsScanning(false);
      });
    }
    return () => {
      if (html5QrCode) {
        html5QrCode.stop().catch(err => console.error("Stop error", err));
      }
    };
  }, [isScanning, products]);

  const filteredProducts = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return products;
    
    return products.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.sku.toLowerCase().includes(query) ||
      p.barcode?.toLowerCase().includes(query) ||
      p.brand?.toLowerCase().includes(query) ||
      p.category?.toLowerCase().includes(query)
    );
  }, [products, search]);

  const getEffectiveStock = (product: Product) => {
    const template = productTemplates.find(t => t.id === product.templateId);
    if (!template?.isBundle || !template.bundleItems || template.bundleItems.length === 0) {
      return product.stockLevel;
    }

    let minStock = Infinity;
    for (const item of template.bundleItems) {
      const componentProduct = products.find(p => p.templateId === item.templateId);
      if (!componentProduct) {
        minStock = 0;
        break;
      }
      const available = Math.floor(componentProduct.stockLevel / item.quantity);
      if (available < minStock) minStock = available;
    }
    
    // Return the max of pre-assembled stock and virtual stock from components
    const virtualStock = minStock === Infinity ? 0 : minStock;
    return Math.max(product.stockLevel || 0, virtualStock);
  };

  const addToCart = (product: Product, quantity: number = 1) => {
    const effectiveStock = getEffectiveStock(product);
    
    if (effectiveStock <= 0) {
      toast.error('Out of stock!');
      return;
    }
    
    if (quantity > effectiveStock) {
      toast.error(`Only ${effectiveStock} units available`);
      return;
    }
    
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        const newQty = existing.quantity + quantity;
        if (newQty > effectiveStock) {
          toast.error(`Only ${effectiveStock} units available`);
          return prev;
        }
        const newSubtotal = newQty * existing.price;
        const itemTotal = existing.discountType === 'percentage' 
          ? newSubtotal * (1 - (existing.discount || 0) / 100)
          : Math.max(0, newSubtotal - (existing.discount || 0));

        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: newQty, subtotal: newSubtotal, total: itemTotal }
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        quantity: quantity,
        price: product.price,
        subtotal: product.price * quantity,
        total: product.price * quantity
      }];
    });
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const product = products.find(p => p.barcode === barcodeInput.trim() || p.sku === barcodeInput.trim());
    if (product) {
      addToCart(product, 1);
      setBarcodeInput('');
      toast.success(`Added ${product.name}`);
    } else {
      toast.error('Product not found with this barcode/SKU');
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      const item = prev.find(i => i.productId === productId);
      if (!item) return prev;

      const product = products.find(p => p.id === productId);
      if (!product) return prev;

      const effectiveStock = getEffectiveStock(product);
      const newQty = item.quantity + delta;

      if (newQty < 1) return prev;

      if (delta > 0 && newQty > effectiveStock) {
        toast.error(`Cannot add more. Only ${effectiveStock} units available.`, {
          id: `stock-limit-${productId}`, // Prevent duplicate toasts
          duration: 2000
        });
        return prev;
      }

      const newSubtotal = newQty * item.price;
      const itemTotal = item.discountType === 'percentage' 
        ? newSubtotal * (1 - (item.discount || 0) / 100)
        : Math.max(0, newSubtotal - (item.discount || 0));

      return prev.map(i => 
        i.productId === productId 
          ? { ...i, quantity: newQty, subtotal: newSubtotal, total: itemTotal }
          : i
      );
    });
  };

  const updateItemDiscount = (productId: string, discount: number, type: 'fixed' | 'percentage') => {
    logEvent({ type: 'button_click', label: 'Apply Item Discount', id: productId, value: discount, unit: type });
    setCart(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      
      const itemTotal = type === 'percentage' 
        ? item.subtotal * (1 - discount / 100)
        : Math.max(0, item.subtotal - discount);

      return { ...item, discount, discountType: type, total: itemTotal };
    }));
  };

  const cartSubtotal = useMemo(() => 
    cart.reduce((acc, item) => acc + item.total, 0),
  [cart]);
  
  const finalDiscount = useMemo(() => {
    if (cartDiscountType === 'percentage') {
      return cartSubtotal * (Math.min(100, cartDiscount) / 100);
    }
    return Math.min(cartSubtotal, cartDiscount);
  }, [cartSubtotal, cartDiscount, cartDiscountType]);

  const totalBeforeTax = Math.max(0, cartSubtotal - finalDiscount);
  const taxAmount = totalBeforeTax * (vatRate / 100);
  const finalTotal = totalBeforeTax + taxAmount;

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!currentShift) {
      toast.error('Please open a shift first!');
      return;
    }

    if (paymentMethod === 'momo') {
      if (!momoPhone && !customerPhone) {
        toast.error('Please enter a MoMo phone number');
        return;
      }
      setMomoStep('prompting');
      return; // Stop here and show the MoMo dialog
    }

    if (paymentMethod === 'credit') {
      if (!selectedCustomerId) {
        toast.error('Please select a customer for credit sale');
        return;
      }
      const customer = customers.find(c => c.id === selectedCustomerId);
      if (customer && customer.currentBalance + finalTotal > customer.creditLimit) {
        toast.error(`Credit limit exceeded! Limit: ₵${formatCurrency(customer.creditLimit)}, Current: ₵${formatCurrency(customer.currentBalance)}`);
        return;
      }
    }

    completeSale();
  };

  const completeSale = () => {
    logEvent({ 
      type: 'sale_completed', 
      total: finalTotal, 
      items: cart.reduce((acc, item) => acc + item.quantity, 0) 
    });

    onSaleComplete({
      items: cart,
      subtotal: cartSubtotal,
      discount: cartDiscount,
      discountType: cartDiscountType,
      total: finalTotal,
      tax: taxAmount,
      paymentMethod,
      customerId: paymentMethod === 'credit' ? selectedCustomerId : undefined,
      customerPhone,
      momoPhone: paymentMethod === 'momo' ? momoPhone : undefined,
      momoReference: paymentMethod === 'momo' ? momoReference : undefined,
      momoNetwork: paymentMethod === 'momo' ? momoNetwork : undefined,
      timestamp: new Date().toISOString(),
      shiftId: currentShift?.id || '',
      clerkId: currentShift?.userId || '',
      clerkName: currentShift?.userName || ''
    });
    
    setCart([]);
    setCustomerPhone('');
    setSelectedCustomerId('');
    setMomoReference('');
    setMomoPhone('');
    setMomoNetwork('mtn');
    setMomoStep('idle');
    setCartDiscount(0);
    setCartDiscountType('fixed');
  };

  const verifyMomoPayment = async () => {
    if (!momoReference.trim()) {
      toast.error('Transaction reference is required');
      return;
    }
    
    setMomoStep('confirming');
    
    // Simulate gateway verification
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // In a real app, you'd call an API here
    // For demo, we'll assume it's valid if it's at least 6 chars
    if (momoReference.length < 6) {
      toast.error('Invalid reference format. Please check and try again.');
      setMomoStep('verifying');
      return;
    }

    toast.success('Payment Verified Successfully!');
    completeSale();
  };

  return (
    <div className="flex flex-col h-full min-h-[600px] gap-4">
      {isScanning && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-[2rem] overflow-hidden shadow-2xl border border-white/20">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg">
                  <Scan size={20} className="text-orange-500" />
                  Live Scanner
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Continuous Scan Mode Active</p>
              </div>
              <button 
                onClick={() => setIsScanning(false)}
                className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-red-500 hover:rotate-90 transition-all duration-300"
              >
                <X size={20} />
              </button>
            </div>
            <div className="relative">
              <div id="qr-reader" className="w-full aspect-square bg-black" />
              <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-orange-500 rounded-2xl relative">
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-orange-500 rounded-tl-md" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-orange-500 rounded-tr-md" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-orange-500 rounded-bl-md" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-orange-500 rounded-br-md" />
                </div>
              </div>
            </div>
            <div className="p-8 text-center bg-slate-50">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-xs font-black mb-4 animate-pulse">
                <Zap size={14} fill="currentColor" />
                AUTO-ADDING ITEMS
              </div>
              <p className="text-sm text-slate-600 font-bold leading-relaxed">
                Point your camera at a barcode or QR code.<br/>
                Items will be added instantly to your cart.
              </p>
              <Button 
                onClick={() => setIsScanning(false)}
                className="mt-6 w-full bg-slate-900 hover:bg-black text-white py-6 rounded-2xl font-black text-sm uppercase tracking-widest"
              >
                Done Scanning
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-slate-100 shadow-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Till Active:</span>
            <span className="text-xs font-black text-slate-800">{currentShift?.userName}</span>
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded">
            ID: {currentShift?.displayId || currentShift?.id} | Started: {currentShift && format(new Date(currentShift.startTime), 'HH:mm')}
          </div>
        </div>
        <ShiftManager 
          currentShift={currentShift} 
          onOpenShift={onOpenShift} 
          onCloseShift={onCloseShift}
          sales={sales}
          ledger={ledger}
          businessUnit={businessUnit}
          branches={branches}
        />
      </div>

      <AnimatePresence>
        {momoStep !== 'idle' && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl border border-white/20"
            >
              <div className="p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                  {momoStep === 'prompting' || momoStep === 'confirming' ? (
                    <Loader2 size={40} className="animate-spin" />
                  ) : (
                    <Smartphone size={40} />
                  )}
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                    {momoStep === 'prompting' && 'Sending Prompt...'}
                    {momoStep === 'verifying' && 'Verify Payment'}
                    {momoStep === 'confirming' && 'Verifying with Gateway...'}
                  </h3>
                  <p className="text-sm text-slate-500 font-bold leading-relaxed px-4">
                    {momoStep === 'prompting' && `We are sending a MoMo payment prompt to ${momoPhone || customerPhone} on ${momoNetwork.toUpperCase()}. Please ask the customer to authorize it.`}
                    {momoStep === 'verifying' && 'Please enter the transaction reference from the customer\'s confirmation message.'}
                    {momoStep === 'confirming' && 'Connecting to the MoMo gateway to confirm the transaction status...'}
                  </p>
                </div>

                {momoStep === 'prompting' && (
                  <div className="pt-4 space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      {(['mtn', 'vodafone', 'airteltigo'] as const).map(net => (
                        <button
                          key={net}
                          onClick={() => setMomoNetwork(net)}
                          className={cn(
                            "p-2 rounded-xl border text-[10px] font-black uppercase transition-all",
                            momoNetwork === net ? "bg-orange-500 text-white border-orange-600" : "bg-slate-50 text-slate-400 border-slate-100"
                          )}
                        >
                          {net}
                        </button>
                      ))}
                    </div>
                    <Button 
                      onClick={() => setMomoStep('verifying')}
                      className="w-full bg-slate-900 hover:bg-black text-white py-6 rounded-2xl font-black text-sm uppercase tracking-widest"
                    >
                      I've Sent the Prompt
                    </Button>
                    <button 
                      onClick={() => setMomoStep('idle')}
                      className="mt-4 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest"
                    >
                      Cancel Payment
                    </button>
                  </div>
                )}

                {momoStep === 'verifying' && (
                  <div className="space-y-4 pt-4">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Enter Transaction Reference"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-center text-lg font-black text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all placeholder:text-slate-300"
                        value={momoReference}
                        onChange={e => setMomoReference(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button 
                        onClick={() => setMomoStep('prompting')}
                        variant="outline"
                        className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-slate-200"
                      >
                        Back
                      </Button>
                      <Button 
                        onClick={verifyMomoPayment}
                        className="flex-[2] bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest"
                      >
                        Confirm & Complete
                      </Button>
                    </div>
                  </div>
                )}

                {momoStep === 'confirming' && (
                  <div className="pt-8 flex flex-col items-center gap-4">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Awaiting Gateway Response</p>
                  </div>
                )}
              </div>
              
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Secure MoMo Gateway Active</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 overflow-hidden">
        <div className="md:col-span-7 lg:col-span-8 flex flex-col gap-4 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-3 flex items-center gap-3 border-orange-200 bg-orange-50/30 group focus-within:ring-2 ring-orange-500/20 transition-all relative overflow-hidden">
              <div className="p-2 bg-orange-500 text-white rounded-lg shadow-sm">
                <Scan size={18} />
              </div>
              <form onSubmit={handleBarcodeSubmit} className="flex-1 flex items-center gap-2">
                <input 
                  type="text" 
                  placeholder="Scan Barcode..."
                  className="flex-1 bg-transparent outline-none text-sm font-bold text-slate-800 placeholder:text-slate-400"
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  autoFocus
                />
              </form>
              <button 
                onClick={() => setIsScanning(true)}
                className="p-2 text-orange-600 hover:text-orange-500 hover:bg-white rounded-lg transition-all"
                title="Open Camera Scanner"
              >
                <Camera size={20} />
              </button>
            </Card>

            <Card className="p-3 flex items-center gap-3">
              <Search className="text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search products..."
                className="flex-1 outline-none text-sm text-slate-700"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </Card>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 overflow-y-auto pr-2 pb-4">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-300 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-100">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                  <Search size={32} className="text-slate-200" />
                </div>
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No matching products</p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">Try adjusting your search query</p>
                {search && (
                  <button 
                    onClick={() => setSearch('')}
                    className="mt-4 text-xs font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              filteredProducts.map(product => (
                <motion.button 
                  key={product.id}
                  whileHover={{ y: -4, boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => addToCart(product)}
                  className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-orange-200 transition-all text-left group"
                >
                  <div className="aspect-square bg-slate-50 rounded-xl mb-3 flex items-center justify-center text-slate-300 group-hover:text-orange-300 transition-colors">
                    <Package size={36} />
                  </div>
                  <h4 className="font-bold text-sm text-slate-800 line-clamp-1">{product.name}</h4>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-orange-600 font-black text-sm">₵{formatCurrency(product.price)}</span>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter",
                      product.stockLevel > 10 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {product.stockLevel} IN STOCK
                    </span>
                  </div>
                </motion.button>
              ))
            )}
          </div>
        </div>

        <div className="md:col-span-5 lg:col-span-4 flex flex-col h-full overflow-hidden">
          <Card className="flex flex-col h-full overflow-hidden border-orange-100 shadow-lg">
          <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-200">
                <ShoppingCart size={20} />
              </div>
              <h3 className="font-black text-slate-800 uppercase tracking-tight">Current Order</h3>
            </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    const discount = prompt('Enter discount amount:');
                    if (discount !== null) {
                      setCartDiscount(Number(discount));
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-600 rounded-lg text-[10px] font-black uppercase hover:bg-orange-200 transition-colors"
                >
                  <Tag size={12} />
                  Discount
                </button>
                <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  {cart.length} ITEMS
                </span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-white">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 opacity-50">
                  <ShoppingCart size={40} strokeWidth={1} />
                  <p className="text-xs font-bold uppercase tracking-widest">Cart Empty</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.productId} className="flex flex-col gap-2 p-3 rounded-xl border border-slate-50 bg-slate-50/30 hover:bg-white hover:border-orange-200 hover:shadow-sm transition-all group">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-xs font-black text-slate-800 leading-tight">{item.name}</p>
                        <p className="text-[10px] text-slate-500 font-bold">₵{formatCurrency(item.price)} / unit</p>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.productId)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-white rounded-lg border border-slate-100 p-0.5 shadow-sm">
                            <button 
                              onClick={() => updateQuantity(item.productId, -1)}
                              className="p-1 hover:bg-orange-50 hover:text-orange-500 rounded-md transition-all text-slate-400"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="w-8 text-center text-xs font-black text-slate-800">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.productId, 1)}
                              disabled={item.quantity >= (products.find(p => p.id === item.productId)?.stockLevel || 0)}
                              className="p-1 hover:bg-orange-50 hover:text-orange-500 rounded-md transition-all text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <button 
                            onClick={() => {
                              const discount = prompt('Enter item discount:');
                              if (discount !== null) {
                                updateItemDiscount(item.productId, Number(discount), item.discountType || 'fixed');
                              }
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-100 rounded-lg shadow-sm hover:bg-orange-50 transition-colors group/disc"
                          >
                            <Tag size={10} className="text-slate-400 group-hover/disc:text-orange-500" />
                            <span className="text-[10px] font-bold text-slate-600">
                              {item.discount ? (item.discountType === 'percentage' ? `${item.discount}%` : `₵${item.discount}`) : 'Disc'}
                            </span>
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        {item.discount ? (
                          <p className="text-[10px] text-slate-400 line-through font-bold">₵{formatCurrency(item.subtotal)}</p>
                        ) : null}
                        <p className="text-sm font-black text-orange-600">₵{formatCurrency(item.total)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-4 overflow-y-auto max-h-[60%]">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>Subtotal</span>
                  <span className="text-slate-600">GHC {formatCurrency(cartSubtotal)}</span>
                </div>
                
                <div className="flex items-center justify-between py-2 border-y border-slate-200/50">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-orange-100 text-orange-600 rounded-lg">
                      <Tag size={14} />
                    </div>
                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Discount</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm focus-within:border-orange-500 transition-all">
                      <input 
                        type="number" 
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="w-16 bg-transparent px-2 py-0.5 text-xs font-black text-slate-800 outline-none"
                        value={cartDiscount || ''}
                        onChange={e => {
                          const val = Math.max(0, Number(e.target.value));
                          if (cartDiscountType === 'percentage' && val > 100) return;
                          setCartDiscount(val);
                          logEvent({ type: 'button_click', label: 'Apply Cart Discount', value: val, unit: cartDiscountType });
                        }}
                      />
                      <button 
                        onClick={() => {
                          const nextType = cartDiscountType === 'percentage' ? 'fixed' : 'percentage';
                          setCartDiscountType(nextType);
                          logEvent({ type: 'button_click', label: 'Toggle Cart Discount Type', unit: nextType });
                        }}
                        className="w-8 h-8 flex items-center justify-center bg-slate-900 text-white rounded-lg text-[10px] font-black hover:bg-black transition-colors"
                      >
                        {cartDiscountType === 'percentage' ? '%' : '₵'}
                      </button>
                    </div>
                    {finalDiscount > 0 && (
                      <span className="text-[10px] font-black text-orange-600">-₵{formatCurrency(finalDiscount)}</span>
                    )}
                  </div>
                </div>

                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>Tax (GRA {vatRate}%)</span>
                  <span>GHC {formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-slate-200">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Amount</p>
                    <p className="text-2xl font-black text-slate-900 tracking-tighter">₵{formatCurrency(finalTotal)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Incl. VAT</p>
                    <p className="text-xs font-bold text-slate-500">₵{formatCurrency(taxAmount)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <button 
                  onClick={() => setPaymentMethod('cash')}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all duration-300",
                    paymentMethod === 'cash' ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200" : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                  )}
                >
                  <Banknote size={20} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Cash</span>
                </button>
                <button 
                  onClick={() => setPaymentMethod('card')}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all duration-300",
                    paymentMethod === 'card' ? "bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-200" : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                  )}
                >
                  <CreditCard size={20} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Card</span>
                </button>
                <button 
                  onClick={() => setPaymentMethod('momo')}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all duration-300",
                    paymentMethod === 'momo' ? "bg-orange-500 text-white border-orange-500 shadow-xl shadow-orange-200" : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                  )}
                >
                  <Smartphone size={20} />
                  <span className="text-[10px] font-black uppercase tracking-widest">MoMo</span>
                </button>
                <button 
                  onClick={() => setPaymentMethod('credit')}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all duration-300",
                    paymentMethod === 'credit' ? "bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-200" : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                  )}
                >
                  <Users size={20} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Credit</span>
                </button>
              </div>

              <div className="space-y-2">
                {paymentMethod === 'credit' && (
                  <div className="relative">
                    <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select 
                      className="w-full pl-10 pr-3 py-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 transition-all uppercase tracking-widest appearance-none"
                      value={selectedCustomerId}
                      onChange={e => setSelectedCustomerId(e.target.value)}
                    >
                      <option value="">SELECT CUSTOMER</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Bal: ₵{formatCurrency(c.currentBalance)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="tel" 
                    placeholder="CUSTOMER PHONE"
                    className="w-full pl-10 pr-3 py-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 transition-all placeholder:text-slate-300 uppercase tracking-widest"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                  />
                </div>

                {paymentMethod === 'momo' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2"
                  >
                    <div className="relative">
                      <Smartphone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="tel" 
                        placeholder="MOMO NUMBER"
                        className="w-full pl-10 pr-3 py-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 transition-all placeholder:text-slate-300 uppercase tracking-widest"
                        value={momoPhone}
                        onChange={e => setMomoPhone(e.target.value)}
                      />
                    </div>
                    <div className="relative">
                      <History size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="MOMO REF"
                        className="w-full pl-10 pr-3 py-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 transition-all placeholder:text-slate-300 uppercase tracking-widest"
                        value={momoReference}
                        onChange={e => setMomoReference(e.target.value)}
                      />
                    </div>
                  </motion.div>
                )}
              </div>

              <Button 
                className="w-full py-5 text-sm rounded-xl shadow-lg shadow-orange-200"
                disabled={cart.length === 0}
                onClick={handleCheckout}
              >
                <CheckCircle2 size={18} />
                Complete Sale
              </Button>
            </div>
      </Card>
      </div>
      </div>
    </div>
  );
};

const ProductCatalog = ({ templates, onAddTemplate, onUpdateTemplate, onDeleteTemplate, categories }: { templates: ProductTemplate[], onAddTemplate: (t: Partial<ProductTemplate>) => void, onUpdateTemplate: (id: string, t: Partial<ProductTemplate>) => void, onDeleteTemplate: (id: string) => void, categories: Category[] }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProductTemplate | null>(null);
  const [search, setSearch] = useState('');
  const [isBundle, setIsBundle] = useState(false);
  const [bundleItems, setBundleItems] = useState<BundleItem[]>([]);

  useEffect(() => {
    if (editingTemplate) {
      setIsBundle(!!editingTemplate.isBundle);
      setBundleItems(editingTemplate.bundleItems || []);
    } else {
      setIsBundle(false);
      setBundleItems([]);
    }
  }, [editingTemplate, isAdding]);

  const filtered = templates.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.sku.toLowerCase().includes(search.toLowerCase())
  );

  const addBundleItem = () => {
    setBundleItems([...bundleItems, { templateId: '', quantity: 1 }]);
  };

  const removeBundleItem = (index: number) => {
    setBundleItems(bundleItems.filter((_, i) => i !== index));
  };

  const updateBundleItem = (index: number, field: keyof BundleItem, value: any) => {
    const newItems = [...bundleItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setBundleItems(newItems);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">Product Catalog</h3>
          <p className="text-slate-500 text-sm">Master product definitions for consistency across branches</p>
        </div>
        <Button onClick={() => setIsAdding(true)} className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-orange-200 flex items-center gap-2">
          <Plus size={20} />
          Create Template
        </Button>
      </div>

      <Card className="p-4 flex items-center gap-3">
        <Search className="text-slate-400" size={20} />
        <input 
          placeholder="Search catalog by name or SKU..." 
          className="flex-1 bg-transparent outline-none text-slate-600 font-medium"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(template => (
          <Card key={template.id} className="p-6 hover:shadow-xl transition-all border-slate-100 group relative">
            <div className="absolute top-4 right-4 flex gap-2">
              <button 
                onClick={() => setEditingTemplate(template)}
                className="p-2 text-slate-400 hover:text-orange-500 transition-colors"
                title="Edit Template"
              >
                <Settings size={16} />
              </button>
              <button 
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this template? This will not delete existing products in branches, but they will no longer be linked to this template.')) {
                    onDeleteTemplate(template.id);
                  }
                }}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Delete Template"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-orange-50 text-orange-500 rounded-2xl group-hover:bg-orange-500 group-hover:text-white transition-colors relative">
                <Package size={24} />
                {template.isBundle && (
                  <div className="absolute -top-2 -right-2 bg-blue-500 text-white p-1 rounded-full shadow-sm" title="Product Bundle">
                    <Zap size={10} />
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SKU</span>
                <p className="text-xs font-bold text-slate-800">{template.sku}</p>
              </div>
            </div>
            <h4 className="text-lg font-black text-slate-800 mb-1">{template.name}</h4>
            <div className="flex items-center gap-2 mb-4">
              <p className="text-xs text-slate-500">{template.brand || 'No Brand'}</p>
              {template.barcode && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-md">
                  <Scan size={10} />
                  {template.barcode}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-slate-50 rounded-xl">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cost</p>
                <p className="text-sm font-black text-slate-700">GHC {formatCurrency(template.costPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Selling</p>
                <p className="text-sm font-black text-orange-600">GHC {formatCurrency(template.sellingPrice)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                {categories.find(c => c.id === template.category)?.name || template.category || 'General'}
              </span>
              {template.isBundle && (
                <span className="px-2 py-1 bg-blue-100 text-blue-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                  Bundle ({template.bundleItems?.length || 0} Items)
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {(isAdding || editingTemplate) && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-xl font-bold text-slate-800">
                  {editingTemplate ? 'Edit Product Template' : 'Create Product Template'}
                </h3>
                <button onClick={() => { setIsAdding(false); setEditingTemplate(null); }} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              <form 
                className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const data: Partial<ProductTemplate> = {
                    name: formData.get('name') as string,
                    sku: formData.get('sku') as string,
                    category: formData.get('category') as string,
                    unit: formData.get('unit') as string,
                    brand: formData.get('brand') as string,
                    barcode: formData.get('barcode') as string,
                    description: formData.get('description') as string,
                    costPrice: Number(formData.get('costPrice')),
                    sellingPrice: Number(formData.get('sellingPrice')),
                    isBundle,
                    bundleItems: isBundle ? bundleItems.filter(item => item.templateId) : [],
                  };

                  if (editingTemplate) {
                    onUpdateTemplate(editingTemplate.id, data);
                  } else {
                    onAddTemplate(data);
                  }
                  setIsAdding(false);
                  setEditingTemplate(null);
                }}
              >
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <input 
                    type="checkbox" 
                    id="isBundle" 
                    checked={isBundle} 
                    onChange={e => setIsBundle(e.target.checked)}
                    className="w-4 h-4 text-orange-500 rounded border-slate-300 focus:ring-orange-500"
                  />
                  <label htmlFor="isBundle" className="text-sm font-bold text-slate-700 cursor-pointer">This is a Product Bundle</label>
                </div>

                {isBundle && (
                  <div className="space-y-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest">Bundle Constituents</h4>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={addBundleItem}
                        className="h-7 px-2 text-[10px] border-blue-200 text-blue-700 hover:bg-blue-100"
                      >
                        <Plus size={12} className="mr-1" /> Add Item
                      </Button>
                    </div>
                    
                    {bundleItems.length === 0 && (
                      <p className="text-[10px] text-blue-500 italic text-center py-2">No items added to this bundle yet.</p>
                    )}

                    <div className="space-y-2">
                      {bundleItems.map((item, index) => (
                        <div key={index} className="flex gap-2 items-end">
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-bold text-blue-600 uppercase">Product</label>
                            <select 
                              value={item.templateId} 
                              onChange={e => updateBundleItem(index, 'templateId', e.target.value)}
                              required
                              className="w-full p-2 text-xs rounded-lg border border-blue-200 outline-none focus:border-blue-500 bg-white"
                            >
                              <option value="">Select Product</option>
                              {templates.filter(t => t.id !== editingTemplate?.id && !t.isBundle).map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.sku})</option>
                              ))}
                            </select>
                          </div>
                          <div className="w-20 space-y-1">
                            <label className="text-[10px] font-bold text-blue-600 uppercase">Qty</label>
                            <input 
                              type="number" 
                              min="1" 
                              value={item.quantity} 
                              onChange={e => updateBundleItem(index, 'quantity', Number(e.target.value))}
                              required
                              className="w-full p-2 text-xs rounded-lg border border-blue-200 outline-none focus:border-blue-500 bg-white"
                            />
                          </div>
                          <button 
                            type="button" 
                            onClick={() => removeBundleItem(index)}
                            className="p-2 text-blue-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Product Name</label>
                  <input name="name" defaultValue={editingTemplate?.name} required className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">SKU</label>
                    <input name="sku" defaultValue={editingTemplate?.sku} required className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Barcode</label>
                    <input name="barcode" defaultValue={editingTemplate?.barcode} className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Unit of Measure</label>
                    <input name="unit" defaultValue={editingTemplate?.unit} placeholder="e.g. Pcs, Box, Kg, Tablet" className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Brand</label>
                    <input name="brand" defaultValue={editingTemplate?.brand} className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Cost Price (GHC)</label>
                    <input name="costPrice" type="number" min="0" step="0.01" defaultValue={editingTemplate?.costPrice} required className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Selling Price (GHC)</label>
                    <input name="sellingPrice" type="number" min="0" step="0.01" defaultValue={editingTemplate?.sellingPrice} required className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                    <select name="category" defaultValue={editingTemplate?.category} className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500">
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                  <textarea name="description" defaultValue={editingTemplate?.description} className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500 min-h-[100px]" />
                </div>
                <Button type="submit" className="w-full py-3 mt-4">
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const BulkUploadModal = ({ 
  isOpen, 
  onClose, 
  templates, 
  branches, 
  onAddProduct 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  templates: ProductTemplate[], 
  branches: Branch[], 
  onAddProduct: (p: Partial<Product>) => Promise<void> 
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    templateId: '',
    branchId: '',
    stockLevel: '',
    costPrice: '',
    expiryDate: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      Papa.parse(selectedFile, {
        header: true,
        preview: 1,
        complete: (results) => {
          if (results.meta.fields) {
            setHeaders(results.meta.fields);
            // Try to auto-map
            const newMapping = { ...mapping };
            results.meta.fields.forEach(header => {
              const h = header.toLowerCase();
              if (h.includes('template') || h.includes('id')) newMapping.templateId = header;
              if (h.includes('branch')) newMapping.branchId = header;
              if (h.includes('quantity') || h.includes('stock')) newMapping.stockLevel = header;
              if (h.includes('cost') || h.includes('price')) newMapping.costPrice = header;
              if (h.includes('expiry') || h.includes('date')) newMapping.expiryDate = header;
            });
            setMapping(newMapping);
          }
        }
      });
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsProcessing(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[];
        let successCount = 0;
        let errorCount = 0;

        for (const row of rows) {
          try {
            const templateId = row[mapping.templateId];
            const branchId = row[mapping.branchId];
            const stockLevel = Number(row[mapping.stockLevel]);
            const costPrice = Number(row[mapping.costPrice]);
            const expiryDate = row[mapping.expiryDate];

            const template = templates.find(t => t.id === templateId || t.sku === templateId);
            const branch = branches.find(b => b.id === branchId || b.name === branchId);

            if (template && branch && !isNaN(stockLevel)) {
              await onAddProduct({
                templateId: template.id,
                name: template.name,
                sku: template.sku,
                category: template.category,
                brand: template.brand,
                barcode: template.barcode || '',
                unit: template.unit || 'Pcs',
                stockLevel,
                costPrice,
                price: template.sellingPrice || 0,
                branchId: branch.id,
                expiryDate: expiryDate || '',
                updatedAt: new Date().toISOString()
              });
              successCount++;
            } else {
              errorCount++;
            }
          } catch (err) {
            errorCount++;
          }
        }

        toast.success(`Bulk upload complete: ${successCount} added, ${errorCount} failed`);
        setIsProcessing(false);
        onClose();
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-xl font-bold text-slate-800">Bulk Stock Upload</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">1. Select CSV File</label>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-orange-500 transition-colors cursor-pointer relative">
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="mx-auto text-slate-400 mb-2" size={32} />
              <p className="text-sm text-slate-600 font-medium">
                {file ? file.name : "Click or drag CSV file here"}
              </p>
            </div>
          </div>

          {headers.length > 0 && (
            <div className="space-y-4">
              <label className="text-xs font-bold text-slate-500 uppercase">2. Map Columns</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(mapping).map((field) => (
                  <div key={field} className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      {field.replace(/([A-Z])/g, ' $1')}
                    </label>
                    <select 
                      value={mapping[field]}
                      onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                      className="w-full p-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-orange-500"
                    >
                      <option value="">-- Select Column --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleUpload} 
            disabled={!file || isProcessing || !mapping.templateId || !mapping.branchId || !mapping.stockLevel}
            className="bg-orange-500 hover:bg-orange-600 text-white px-8"
          >
            {isProcessing ? "Processing..." : "Start Upload"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

const Inventory = ({ products, categories, branches, onAddProduct, onUpdateProduct, onAddCategory, templates, profile }: { products: Product[], categories: Category[], branches: Branch[], onAddProduct: (p: Partial<Product>) => Promise<void>, onUpdateProduct: (id: string, p: Partial<Product>) => Promise<void>, onAddCategory: (name: string) => void, templates: ProductTemplate[], profile: User | null }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [bulkEditField, setBulkEditField] = useState<'price' | 'reorderPoint' | 'category' | null>(null);
  const [bulkEditValue, setBulkEditValue] = useState<string | number>('');
  const [isConfirmingBulk, setIsConfirmingBulk] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  const expiringSoon = products.filter(p => {
    if (!p.expiryDate) return false;
    const expiry = new Date(p.expiryDate);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    return diff > 0 && diff < (30 * 24 * 60 * 60 * 1000);
  });

  const expiredItems = products.filter(p => {
    if (!p.expiryDate) return false;
    const expiry = new Date(p.expiryDate);
    const now = new Date();
    return expiry < now;
  });

  const lowStockItems = products.filter(p => p.stockLevel <= p.reorderPoint);

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedProductIds.length === filtered.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filtered.map(p => p.id));
    }
  };

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const handleBulkUpdate = async () => {
    if (!bulkEditField || bulkEditValue === '' || selectedProductIds.length === 0) return;
    
    setIsProcessingBulk(true);
    try {
      const updates = selectedProductIds.map(id => {
        const data: Partial<Product> = {};
        if (bulkEditField === 'price') data.price = Number(bulkEditValue);
        if (bulkEditField === 'reorderPoint') data.reorderPoint = Number(bulkEditValue);
        if (bulkEditField === 'category') data.category = String(bulkEditValue);
        return onUpdateProduct(id, data);
      });

      await Promise.all(updates);
      toast.success(`Successfully updated ${selectedProductIds.length} products`);
      setSelectedProductIds([]);
      setIsBulkEditing(false);
      setIsConfirmingBulk(false);
      setBulkEditField(null);
      setBulkEditValue('');
    } catch (err) {
      toast.error('Failed to update some products');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const getVirtualStock = (product: Product) => {
    const template = templates.find(t => t.id === product.templateId);
    if (!template?.isBundle || !template.bundleItems || template.bundleItems.length === 0) {
      return null;
    }

    let minStock = Infinity;
    for (const item of template.bundleItems) {
      const componentProduct = products.find(p => p.templateId === item.templateId && p.branchId === product.branchId);
      if (!componentProduct) {
        minStock = 0;
        break;
      }
      const available = Math.floor(componentProduct.stockLevel / item.quantity);
      if (available < minStock) minStock = available;
    }
    
    return minStock === Infinity ? 0 : minStock;
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div className="space-y-6">
      {(expiringSoon.length > 0 || lowStockItems.length > 0 || expiredItems.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {expiredItems.length > 0 && (
            <Card className="p-6 border-red-100 bg-red-50/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-red-700 uppercase tracking-widest flex items-center gap-2">
                  <AlertCircle size={16} />
                  Expired Items
                </h3>
                <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded-full uppercase">
                  {expiredItems.length} Items
                </span>
              </div>
              <div className="space-y-3">
                {expiredItems.map(item => (
                  <div key={item.id} className="bg-white p-4 rounded-xl border border-red-100 flex items-center justify-between group hover:border-red-300 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{item.name}</p>
                      <p className="text-xs text-red-600 font-medium italic">Expired: {format(new Date(item.expiryDate), 'MMM dd, yyyy')}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">Stock: {item.stockLevel} {item.unit}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {expiringSoon.length > 0 && (
            <Card className="p-6 border-amber-100 bg-amber-50/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={16} />
                  Expiring Soon
                </h3>
                <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] font-black rounded-full uppercase">
                  {expiringSoon.length} Items
                </span>
              </div>
              <div className="space-y-3">
                {expiringSoon.map(item => (
                  <div key={item.id} className="bg-white p-4 rounded-xl border border-amber-100 flex items-center justify-between group hover:border-amber-300 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{item.name}</p>
                      <p className="text-xs text-amber-600 font-medium">Expires: {format(new Date(item.expiryDate), 'MMM dd, yyyy')}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">Stock: {item.stockLevel} {item.unit}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        logEvent({ type: 'button_click', label: 'Quick Add Stock', id: item.id, name: item.name });
                        setSelectedTemplateId(item.templateId);
                        setIsAdding(true);
                      }}
                      className="text-[10px] h-8 px-3 border-amber-200 text-amber-700 hover:bg-amber-50"
                    >
                      <Plus size={12} />
                      Add Stock
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {lowStockItems.length > 0 && (
            <Card className="p-6 border-red-100 bg-red-50/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-red-700 uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Low Stock Alert
                </h3>
                <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded-full uppercase">
                  {lowStockItems.length} Items
                </span>
              </div>
              <div className="space-y-3">
                {lowStockItems.map(item => (
                  <div key={item.id} className="bg-white p-4 rounded-xl border border-red-100 flex items-center justify-between group hover:border-red-300 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{item.name}</p>
                      <p className="text-xs text-red-600 font-medium">Current Stock: {item.stockLevel} {item.unit}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">Reorder Point: {item.reorderPoint}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        logEvent({ type: 'button_click', label: 'Quick Reorder', id: item.id, name: item.name });
                        setSelectedTemplateId(item.templateId);
                        setIsAdding(true);
                      }}
                      className="text-[10px] h-8 px-3 border-red-200 text-red-700 hover:bg-red-50"
                    >
                      <Plus size={12} />
                      Reorder
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm flex-1 max-w-xl focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-50/50 transition-all">
          <Search className="text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="SEARCH INVENTORY BY NAME, SKU OR BARCODE..."
            className="flex-1 outline-none text-slate-800 font-bold text-sm placeholder:text-slate-300 uppercase tracking-wider"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setIsManagingCategories(true)}>
            <Tag size={18} />
            CATEGORIES
          </Button>
          <Button variant="outline" onClick={() => setIsBulkUploading(true)}>
            <Upload size={18} />
            BULK UPLOAD
          </Button>
          <Button onClick={() => setIsAdding(true)} className="bg-orange-500 hover:bg-orange-600 text-white shadow-xl shadow-orange-200">
            <Plus size={20} />
            ADD STOCK
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5">
                  <input 
                    type="checkbox" 
                    className="rounded-lg border-slate-300 text-orange-500 focus:ring-orange-500 w-5 h-5 transition-all"
                    checked={selectedProductIds.length === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Details</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">SKU & Barcode</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Expiry</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Level</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Price</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(product => (
                <tr key={product.id} className={cn(
                  "hover:bg-slate-50 transition-colors",
                  selectedProductIds.includes(product.id) && "bg-orange-50/50"
                )}>
                  <td className="px-6 py-5">
                    <input 
                      type="checkbox" 
                      className="rounded-lg border-slate-300 text-orange-500 focus:ring-orange-500 w-5 h-5 transition-all"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={() => toggleSelectProduct(product.id)}
                    />
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-orange-50 group-hover:text-orange-500 transition-colors">
                        <Package size={24} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{product.name}</p>
                          {templates.find(t => t.id === product.templateId)?.isBundle && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[8px] font-black rounded-full uppercase tracking-widest flex items-center gap-1">
                              <Package size={8} />
                              Bundle
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-0.5">{product.brand} • {product.unit}</p>
                        {product.batchNumber && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-1 h-1 rounded-full bg-orange-500" />
                            <p className="text-[10px] text-orange-600 font-black uppercase tracking-tighter">Batch: {product.batchNumber}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-xs font-mono text-slate-500 font-bold">{product.sku}</p>
                    {product.barcode && (
                      <p className="text-[10px] font-black text-orange-500 flex items-center gap-1 mt-1 uppercase tracking-widest">
                        <Scan size={10} />
                        {product.barcode}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black rounded-full uppercase tracking-widest">
                      {categories.find(c => c.id === product.category)?.name || product.category}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    {product.expiryDate ? (
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                        new Date(product.expiryDate) < new Date() ? "bg-red-100 text-red-600" : 
                        new Date(product.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? "bg-orange-100 text-orange-600" :
                        "bg-green-100 text-green-600"
                      )}>
                        <Calendar size={12} />
                        {new Date(product.expiryDate).toLocaleDateString()}
                      </div>
                    ) : (
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">No Expiry</span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center",
                        branches.find(b => b.id === product.branchId)?.type === 'warehouse' ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                      )}>
                        {branches.find(b => b.id === product.branchId)?.type === 'warehouse' ? <Archive size={16} /> : <Store size={16} />}
                      </div>
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                        {branches.find(b => b.id === product.branchId)?.name || 'Unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm font-black",
                          product.stockLevel <= product.reorderPoint ? "text-red-600" : "text-slate-800"
                        )}>
                          {product.stockLevel}
                        </span>
                        {product.stockLevel <= product.reorderPoint && (
                          <AlertTriangle size={14} className="text-red-500 animate-pulse" />
                        )}
                      </div>
                      {getVirtualStock(product) !== null && (
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                          Virtual: {getVirtualStock(product)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-sm font-black text-slate-800">₵{formatCurrency(product.price)}</p>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      product.stockLevel > product.reorderPoint 
                        ? "bg-emerald-100 text-emerald-700" 
                        : "bg-rose-100 text-rose-700"
                    )}>
                      {product.stockLevel > product.reorderPoint ? "In Stock" : "Low Stock"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedProductIds.length > 0 && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-5 rounded-3xl shadow-2xl flex items-center gap-8 z-40 border border-slate-800"
        >
          <div className="flex items-center gap-3 border-r border-slate-700 pr-8">
            <div className="bg-orange-500 text-white w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shadow-lg shadow-orange-500/20">
              {selectedProductIds.length}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Selected</span>
              <span className="text-sm font-bold">Inventory Items</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => setIsBulkEditing(true)}
              className="bg-white/10 hover:bg-white/20 text-white border-none text-xs font-black uppercase tracking-widest h-12 px-6"
            >
              <Edit3 size={16} />
              Bulk Edit
            </Button>
            <Button 
              variant="ghost"
              onClick={() => setSelectedProductIds([])}
              className="text-slate-400 hover:text-white text-xs font-black uppercase tracking-widest h-12 px-6"
            >
              Deselect All
            </Button>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {isBulkEditing && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-xl font-bold text-slate-800">Bulk Edit Products</h3>
                <button onClick={() => setIsBulkEditing(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                  <p className="text-sm text-orange-800 font-medium">
                    You are editing <span className="font-bold">{selectedProductIds.length}</span> selected products.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Field to Update</label>
                    <select 
                      className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
                      value={bulkEditField || ''}
                      onChange={(e) => setBulkEditField(e.target.value as any)}
                    >
                      <option value="">Select a field</option>
                      <option value="price">Selling Price</option>
                      <option value="reorderPoint">Reorder Point</option>
                      <option value="category">Category</option>
                    </select>
                  </div>

                  {bulkEditField && (
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">New Value</label>
                      {bulkEditField === 'category' ? (
                        <select 
                          className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
                          value={bulkEditValue}
                          onChange={(e) => setBulkEditValue(e.target.value)}
                        >
                          <option value="">Select Category</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input 
                          type="number"
                          step={bulkEditField === 'price' ? '0.01' : '1'}
                          className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
                          placeholder={`Enter new ${bulkEditField}`}
                          value={bulkEditValue}
                          onChange={(e) => setBulkEditValue(e.target.value)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsBulkEditing(false)}>Cancel</Button>
                <Button 
                  onClick={() => setIsConfirmingBulk(true)}
                  disabled={!bulkEditField || bulkEditValue === ''}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-8"
                >
                  Apply Changes
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {isConfirmingBulk && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Confirm Bulk Update</h3>
                <p className="text-slate-600">
                  Are you sure you want to update the <span className="font-bold">{bulkEditField}</span> for <span className="font-bold">{selectedProductIds.length}</span> products?
                </p>
                <p className="text-sm text-slate-500 italic">This action cannot be undone.</p>
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  onClick={handleBulkUpdate}
                  disabled={isProcessingBulk}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-orange-200"
                >
                  {isProcessingBulk ? "Updating..." : "Yes, Update All"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsConfirmingBulk(false)}
                  disabled={isProcessingBulk}
                  className="w-full py-4 rounded-xl font-bold"
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {isBulkUploading && (
          <BulkUploadModal 
            isOpen={isBulkUploading}
            onClose={() => setIsBulkUploading(false)}
            templates={templates}
            branches={branches}
            onAddProduct={onAddProduct}
          />
        )}
        {isAdding && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Add Stock</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Update inventory levels for a product</p>
                </div>
                <button 
                  onClick={() => setIsAdding(false)} 
                  className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-red-500 hover:rotate-90 transition-all duration-300"
                >
                  <X size={20} />
                </button>
              </div>
              <form 
                className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedTemplate) {
                    toast.error("Please select a product template first");
                    return;
                  }
                  const formData = new FormData(e.currentTarget);
                  onAddProduct({
                    templateId: selectedTemplate.id,
                    name: selectedTemplate.name,
                    sku: selectedTemplate.sku,
                    category: selectedTemplate.category,
                    brand: selectedTemplate.brand,
                    barcode: selectedTemplate.barcode || '',
                    unit: selectedTemplate.unit || 'Pcs',
                    batchNumber: formData.get('batchNumber') as string,
                    price: Number(formData.get('price')),
                    costPrice: Number(formData.get('costPrice')),
                    stockLevel: Number(formData.get('stockLevel')),
                    reorderPoint: Number(formData.get('reorderPoint')),
                    branchId: formData.get('branchId') as string,
                    expiryDate: formData.get('expiryDate') as string,
                  });
                  setIsAdding(false);
                  setSelectedTemplateId('');
                }}
              >
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Product Template</label>
                  <select 
                    required
                    className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all"
                    value={selectedTemplateId || ''}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                  >
                    <option value="">-- CHOOSE FROM CATALOG --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.sku})</option>
                    ))}
                  </select>
                  {templates.length === 0 && (
                    <p className="text-[10px] text-orange-500 font-black mt-1 uppercase tracking-widest">No templates found. Create them in the Product Catalog first.</p>
                  )}
                </div>

                {selectedTemplate && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SKU (Linked)</label>
                      <input disabled value={selectedTemplate.sku || ''} className="w-full p-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 text-slate-400 font-bold text-sm outline-none cursor-not-allowed" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category (Linked)</label>
                      <input disabled value={(categories.find(c => c.id === selectedTemplate.category)?.name || selectedTemplate.category) || ''} className="w-full p-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 text-slate-400 font-bold text-sm outline-none cursor-not-allowed" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Batch Number</label>
                      <input name="batchNumber" placeholder="e.g. BATCH-001" className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all placeholder:text-slate-300" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expiry Date (Optional)</label>
                      <input name="expiryDate" type="date" className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost Price (GHC)</label>
                      <input name="costPrice" type="number" min="0" step="0.01" defaultValue={selectedTemplate.costPrice} required className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selling Price (GHC)</label>
                      <input name="price" type="number" min="0" step="0.01" defaultValue={selectedTemplate.sellingPrice} required className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Initial Stock</label>
                      <input name="stockLevel" type="number" min="0" required className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reorder Point</label>
                      <input name="reorderPoint" type="number" min="0" defaultValue={5} required className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Branch</label>
                      <select name="branchId" defaultValue={profile?.branchId} className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all">
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2 pt-4">
                      <Button type="submit" className="w-full py-6 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-slate-200">
                        Save to Inventory
                      </Button>
                    </div>
                  </>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isManagingCategories && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/20"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Categories</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Organize your product catalog</p>
                </div>
                <button 
                  onClick={() => setIsManagingCategories(false)} 
                  className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-red-500 hover:rotate-90 transition-all duration-300"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 space-y-8">
                <form 
                  className="flex gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem('categoryName') as HTMLInputElement;
                    if (input.value) {
                      onAddCategory(input.value);
                      input.value = '';
                    }
                  }}
                >
                  <input 
                    name="categoryName" 
                    placeholder="NEW CATEGORY NAME..." 
                    className="flex-1 p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all placeholder:text-slate-300 uppercase tracking-widest" 
                  />
                  <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white px-6 rounded-2xl font-black text-xs uppercase tracking-widest">Add</Button>
                </form>
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                  {categories.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100 group hover:border-orange-200 transition-all">
                      <span className="text-sm font-black text-slate-700 uppercase tracking-tight">{c.name}</span>
                      <div className="w-2 h-2 bg-slate-200 rounded-full group-hover:bg-orange-500 transition-colors" />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Customers = ({ customers, ledger, onAddCustomer, onUpdateCustomer, onAddPayment, clerkId, businessUnitId, currentShift }: {
  customers: Customer[],
  ledger: CustomerLedgerEntry[],
  onAddCustomer: (customer: Partial<Customer>) => void,
  onUpdateCustomer: (id: string, customer: Partial<Customer>) => void,
  onAddPayment: (customerId: string, amount: number, note: string, paymentMethod: 'cash' | 'card' | 'momo', shiftId?: string) => void,
  clerkId: string,
  businessUnitId: string,
  currentShift: Shift | null
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'momo'>('cash');
  const [paymentNote, setPaymentNote] = useState('');

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.phone.includes(search)
  );

  const customerLedger = selectedCustomer 
    ? ledger.filter(l => l.customerId === selectedCustomer.id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Credit Customers</h2>
          <p className="text-sm text-slate-500 font-medium">Manage credit limits and individual ledgers</p>
        </div>
        <Button onClick={() => setIsAdding(true)} className="bg-slate-900 hover:bg-slate-800">
          <Plus size={18} />
          Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search customers..."
              className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-orange-500 transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="max-h-[600px] overflow-y-auto">
              {filteredCustomers.map(customer => (
                <div 
                  key={customer.id}
                  onClick={() => setSelectedCustomer(customer)}
                  className={cn(
                    "p-4 border-b border-slate-50 cursor-pointer transition-all hover:bg-slate-50",
                    selectedCustomer?.id === customer.id ? "bg-orange-50 border-l-4 border-l-orange-500" : ""
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-slate-800">{customer.name}</h4>
                    <span className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded-full uppercase",
                      customer.currentBalance > customer.creditLimit * 0.9 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
                    )}>
                      ₵{formatCurrency(customer.currentBalance)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Phone size={12} /> {customer.phone}
                  </p>
                </div>
              ))}
              {filteredCustomers.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <Users size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-medium">No customers found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Ledger View */}
        <div className="lg:col-span-2">
          {selectedCustomer ? (
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-800">{selectedCustomer.name}</h3>
                    <p className="text-sm text-slate-500">{selectedCustomer.phone} • {selectedCustomer.address || 'No address'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setIsPaymentModalOpen(true)}
                      className="border-green-200 text-green-600 hover:bg-green-50"
                    >
                      <Banknote size={16} />
                      Record Payment
                    </Button>
                    <Button variant="outline" onClick={() => setIsEditing(true)}>
                      <Edit3 size={16} />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Balance</p>
                    <p className="text-xl font-black text-slate-800">₵{formatCurrency(selectedCustomer.currentBalance)}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Credit Limit</p>
                    <p className="text-xl font-black text-slate-800">₵{formatCurrency(selectedCustomer.creditLimit)}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Available Credit</p>
                    <p className="text-xl font-black text-green-600">₵{formatCurrency(Math.max(0, (selectedCustomer.creditLimit || 0) - (selectedCustomer.currentBalance || 0)))}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Transaction History</h4>
                  <div className="border border-slate-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Balance</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerLedger.map(entry => (
                          <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-xs font-medium text-slate-600">
                              {format(new Date(entry.timestamp), 'dd MMM yyyy, HH:mm')}
                            </td>
                            <td className="p-4">
                              <span className={cn(
                                "text-[10px] font-black px-2 py-0.5 rounded-full uppercase",
                                entry.type === 'sale' ? "bg-orange-100 text-orange-600" : 
                                entry.type === 'payment' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                              )}>
                                {entry.type}
                              </span>
                            </td>
                            <td className={cn(
                              "p-4 text-xs font-bold",
                              entry.type === 'sale' ? "text-red-600" : "text-green-600"
                            )}>
                              {entry.type === 'sale' ? '+' : '-'}₵{formatCurrency(entry.amount)}
                            </td>
                            <td className="p-4 text-xs font-bold text-slate-800">
                              ₵{formatCurrency(entry.balanceAfter)}
                            </td>
                            <td className="p-4 text-xs text-slate-500 italic">
                              {entry.note}
                            </td>
                          </tr>
                        ))}
                        {customerLedger.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-400 text-sm italic">
                              No transactions recorded yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                <Users size={32} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Select a Customer</h3>
              <p className="text-sm text-slate-500 max-w-xs">Choose a customer from the list to view their ledger and manage their account.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Customer Modal */}
      <AnimatePresence>
        {isEditing && selectedCustomer && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-slate-800">Edit Customer</h3>
                <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                onUpdateCustomer(selectedCustomer.id, {
                  name: formData.get('name') as string,
                  phone: formData.get('phone') as string,
                  email: formData.get('email') as string,
                  address: formData.get('address') as string,
                  creditLimit: parseFloat(formData.get('creditLimit') as string) || 0,
                });
                setIsEditing(false);
              }} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input name="name" defaultValue={selectedCustomer.name} required className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium outline-none focus:border-orange-500 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                  <input name="phone" defaultValue={selectedCustomer.phone} required className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium outline-none focus:border-orange-500 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Credit Limit (GHS)</label>
                  <input name="creditLimit" type="number" min="0" step="0.01" defaultValue={selectedCustomer.creditLimit} required className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium outline-none focus:border-orange-500 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Address (Optional)</label>
                  <textarea name="address" defaultValue={selectedCustomer.address} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium outline-none focus:border-orange-500 transition-all h-20" />
                </div>
                <Button type="submit" className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl mt-4">
                  Update Customer Details
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Customer Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-slate-800">Add New Customer</h3>
                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                onAddCustomer({
                  name: formData.get('name') as string,
                  phone: formData.get('phone') as string,
                  email: formData.get('email') as string,
                  address: formData.get('address') as string,
                  creditLimit: parseFloat(formData.get('creditLimit') as string) || 0,
                  currentBalance: 0,
                  businessUnitId
                });
                setIsAdding(false);
              }} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input name="name" required className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium outline-none focus:border-orange-500 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                  <input name="phone" required className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium outline-none focus:border-orange-500 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Credit Limit (GHS)</label>
                  <input name="creditLimit" type="number" min="0" step="0.01" required className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium outline-none focus:border-orange-500 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Address (Optional)</label>
                  <textarea name="address" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium outline-none focus:border-orange-500 transition-all h-20" />
                </div>
                <Button type="submit" className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl mt-4">
                  Create Customer Account
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Record Payment Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-slate-800">Record Payment</h3>
                <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 mb-4">
                  <p className="text-xs text-orange-800 font-medium">Recording payment for:</p>
                  <p className="text-lg font-black text-orange-900">{selectedCustomer?.name}</p>
                  <p className="text-xs text-orange-700">Current Balance: ₵{formatCurrency(selectedCustomer?.currentBalance)}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Amount (GHS)</label>
                  <input 
                    type="number" 
                    min="0"
                    step="0.01" 
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium outline-none focus:border-orange-500 transition-all"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'card', 'momo'] as const).map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={cn(
                          "py-2 px-3 rounded-xl border text-[10px] font-black uppercase transition-all",
                          paymentMethod === method 
                            ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200" 
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Note / Reference</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Cash payment, Check #123"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium outline-none focus:border-orange-500 transition-all"
                    value={paymentNote}
                    onChange={e => setPaymentNote(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={() => {
                    if (selectedCustomer && paymentAmount > 0) {
                      onAddPayment(selectedCustomer.id, paymentAmount, paymentNote, paymentMethod, currentShift?.id);
                      setIsPaymentModalOpen(false);
                      setPaymentAmount(0);
                      setPaymentNote('');
                    }
                  }}
                  className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl mt-4"
                >
                  Confirm Payment
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StockTransfers = ({ 
  transfers, 
  products, 
  branches, 
  onInitiate, 
  onReceive, 
  onCancel,
  profile
}: { 
  transfers: StockTransfer[], 
  products: Product[], 
  branches: Branch[], 
  onInitiate: (t: Partial<StockTransfer>) => void, 
  onReceive: (id: string) => void,
  onCancel: (id: string) => void,
  profile: User | null
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [destinationBranchId, setDestinationBranchId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const canInitiate = profile?.role === 'manager' || profile?.role === 'inventory' || profile?.role === 'warehouse';

  const filteredProducts = products.filter(p => p.branchId === profile?.branchId);

  const filteredTransfers = useMemo(() => {
    return transfers.filter(transfer => {
      const matchStatus = statusFilter === 'all' || transfer.status === statusFilter;
      
      let matchDate = true;
      if (startDate || endDate) {
        const transferDate = new Date(transfer.initiatedAt);
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (transferDate < start) matchDate = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (transferDate > end) matchDate = false;
        }
      }
      
      return matchStatus && matchDate;
    });
  }, [transfers, statusFilter, startDate, endDate]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">Stock Transfers</h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Move goods between branches and warehouses</p>
        </div>
        {canInitiate && (
          <Button 
            onClick={() => setIsAdding(true)} 
            className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-orange-200 flex items-center gap-3 self-start transition-all hover:-translate-y-1"
          >
            <Plus size={20} />
            New Transfer
          </Button>
        )}
      </div>

      <Card className="p-8 bg-slate-50/50 border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Filter by Status</label>
            <select 
              className="w-full p-4 rounded-2xl border-2 border-white bg-white shadow-sm text-sm font-bold text-slate-800 outline-none focus:border-orange-500 transition-all uppercase tracking-tight"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">ALL STATUSES</option>
              <option value="pending">PENDING</option>
              <option value="in-transit">IN-TRANSIT</option>
              <option value="received">RECEIVED</option>
              <option value="cancelled">CANCELLED</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">From Date</label>
            <input 
              type="date"
              className="w-full p-4 rounded-2xl border-2 border-white bg-white shadow-sm text-sm font-bold text-slate-800 outline-none focus:border-orange-500 transition-all"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">To Date</label>
            <input 
              type="date"
              className="w-full p-4 rounded-2xl border-2 border-white bg-white shadow-sm text-sm font-bold text-slate-800 outline-none focus:border-orange-500 transition-all"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          <Button 
            variant="ghost" 
            onClick={() => {
              setStatusFilter('all');
              setStartDate('');
              setEndDate('');
            }}
            className="h-[56px] px-6 text-slate-400 hover:text-orange-500 font-black text-[10px] uppercase tracking-widest"
          >
            Clear Filters
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredTransfers.map(transfer => {
          const source = branches.find(b => b.id === transfer.sourceBranchId);
          const dest = branches.find(b => b.id === transfer.destinationBranchId);
          
          return (
            <motion.div
              key={transfer.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm hover:shadow-xl hover:border-orange-100 transition-all group"
            >
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-orange-50 group-hover:text-orange-500 transition-colors">
                    <Package size={28} />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none mb-1">
                      {transfer.productName}
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      QTY: {transfer.quantity}
                    </p>
                  </div>
                </div>
                <div className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                  transfer.status === 'pending' ? "bg-orange-100 text-orange-600" :
                  transfer.status === 'received' ? "bg-emerald-100 text-emerald-600" :
                  transfer.status === 'in-transit' ? "bg-blue-100 text-blue-600" :
                  "bg-slate-100 text-slate-600"
                )}>
                  {transfer.status}
                </div>
              </div>

              <div className="flex items-center gap-4 mb-8 p-4 bg-slate-50 rounded-3xl border border-slate-100">
                <div className="flex-1 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Source</p>
                  <p className="text-xs font-black text-slate-700 uppercase">{source?.name || 'Unknown'}</p>
                </div>
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-300">
                  <ArrowRight size={16} />
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Destination</p>
                  <p className="text-xs font-black text-slate-700 uppercase">{dest?.name || 'Unknown'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                <div className="flex items-center gap-2 text-slate-400">
                  <Clock size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {format(new Date(transfer.initiatedAt), 'MMM dd, HH:mm')}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {transfer.status === 'pending' && transfer.destinationBranchId === profile?.branchId && (
                    <button 
                      onClick={() => onReceive(transfer.id)}
                      className="flex items-center gap-2 bg-slate-900 hover:bg-black text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-slate-200"
                    >
                      <CheckCircle2 size={16} />
                      Receive
                    </button>
                  )}
                  {transfer.status === 'pending' && transfer.sourceBranchId === profile?.branchId && (
                    <button 
                      onClick={() => onCancel(transfer.id)}
                      className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="Cancel Transfer"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}

        {filteredTransfers.length === 0 && (
          <div className="lg:col-span-2 text-center py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
            <div className="w-20 h-20 bg-white shadow-sm text-slate-200 rounded-full flex items-center justify-center mx-auto mb-6">
              <Package size={40} />
            </div>
            <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">No Transfers Found</h3>
            <p className="text-slate-400 text-sm mt-2">Try adjusting your filters or initiate a new transfer.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white/20"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">New Transfer</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Move stock between locations</p>
                </div>
                <button 
                  onClick={() => setIsAdding(false)} 
                  className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-red-500 hover:rotate-90 transition-all duration-300"
                >
                  <X size={20} />
                </button>
              </div>
              <form 
                className="p-8 space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedProduct || !destinationBranchId) return;
                  if (quantity > selectedProduct.stockLevel) {
                    toast.error("Not enough stock in source branch!");
                    return;
                  }
                  onInitiate({
                    sourceBranchId: profile?.branchId,
                    destinationBranchId,
                    productId: selectedProduct.id,
                    templateId: selectedProduct.templateId,
                    productName: selectedProduct.name,
                    quantity,
                    notes,
                    status: 'pending'
                  });
                  setIsAdding(false);
                }}
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Product</label>
                  <select 
                    required
                    className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all"
                    onChange={e => setSelectedProduct(filteredProducts.find(p => p.id === e.target.value) || null)}
                  >
                    <option value="">-- CHOOSE PRODUCT --</option>
                    {filteredProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (Stock: {p.stockLevel})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Destination Branch</label>
                  <select 
                    required
                    className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all"
                    value={destinationBranchId}
                    onChange={e => setDestinationBranchId(e.target.value)}
                  >
                    <option value="">-- SELECT DESTINATION --</option>
                    {branches.filter(b => b.id !== profile?.branchId).map(b => (
                      <option key={b.id} value={b.id}>{b.name.toUpperCase()} ({b.type.toUpperCase()})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantity to Transfer</label>
                  <input 
                    type="number" 
                    required 
                    min="1"
                    max={selectedProduct?.stockLevel || 1}
                    className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all placeholder:text-slate-300"
                    value={quantity}
                    onChange={e => setQuantity(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Notes</label>
                  <textarea 
                    className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white transition-all min-h-[100px] placeholder:text-slate-300"
                    placeholder="REASON FOR TRANSFER..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                <div className="pt-4">
                  <Button type="submit" className="w-full py-6 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-slate-200">
                    Initiate Transfer
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SalesArchive = ({ sales, onRefund, profile, businessUnit, branches }: { sales: Sale[], onRefund: (sale: Sale, reason: string) => void, profile: User | null, businessUnit: BusinessUnit | null | undefined, branches: Branch[] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedSaleForDetails, setSelectedSaleForDetails] = useState<Sale | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  const filteredSales = useMemo(() => {
    return sales.filter(s => 
      s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.clerkName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.customerPhone?.includes(searchTerm)
    );
  }, [sales, searchTerm]);

  const handleRefundClick = (sale: Sale) => {
    setSelectedSale(sale);
    setIsRefundModalOpen(true);
  };

  const confirmRefund = () => {
    if (selectedSale && refundReason) {
      onRefund(selectedSale, refundReason);
      setIsRefundModalOpen(false);
      setSelectedSale(null);
      setRefundReason('');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">Sales Archive</h2>
          <p className="text-slate-500 font-medium mt-1">RETRIEVE AND MANAGE ALL PAST TRANSACTIONS</p>
        </div>
        <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm flex-1 max-w-xl focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-50/50 transition-all">
          <Search className="text-slate-400" size={20} />
          <input
            type="text"
            placeholder="SEARCH BY ID, CLERK, OR PHONE..."
            className="flex-1 outline-none text-slate-800 font-bold text-sm placeholder:text-slate-300 uppercase tracking-wider"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Time</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sale ID</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Clerk</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Items</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-5 whitespace-nowrap text-xs font-bold text-slate-600">
                    {format(new Date(sale.timestamp), 'MMM dd, yyyy • HH:mm')}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-xs font-mono text-slate-500 font-bold">
                    #{sale.id.slice(-8).toUpperCase()}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 font-black text-[10px] uppercase">
                        {sale.clerkName?.charAt(0)}
                      </div>
                      <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{sale.clerkName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-xs font-bold text-slate-600">
                    <span className="px-2 py-1 bg-slate-100 rounded-md text-[10px] font-black uppercase tracking-widest">
                      {sale.items.length} items
                    </span>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm font-black text-slate-800">
                    ₵{formatCurrency(sale.total)}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      sale.status === 'refunded' 
                        ? 'bg-rose-100 text-rose-600' 
                        : 'bg-emerald-100 text-emerald-600'
                    )}>
                      {sale.status || 'completed'}
                    </span>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        onClick={() => setSelectedSaleForDetails(sale)}
                        className="h-9 w-9 p-0 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      >
                        <Eye size={16} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={() => generateReceiptPDF(sale, businessUnit, branches.find(b => b.id === sale.branchId), branches)}
                        className="h-9 w-9 p-0 rounded-xl hover:bg-orange-50 text-slate-400 hover:text-orange-600"
                      >
                        <Printer size={16} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={() => generateInvoicePDF(sale, businessUnit, branches.find(b => b.id === sale.branchId), branches)}
                        className="h-9 w-9 p-0 rounded-xl hover:bg-blue-50 text-slate-400 hover:text-blue-600"
                      >
                        <FileText size={16} />
                      </Button>
                      {sale.status !== 'refunded' && ['manager', 'supervisor'].includes(profile?.role || '') && (
                        <Button 
                          variant="ghost" 
                          onClick={() => handleRefundClick(sale)}
                          className="h-9 w-9 p-0 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                        >
                          <RefreshCcw size={16} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AnimatePresence>
        {selectedSaleForDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white/20"
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Sale Details</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Transaction ID: {selectedSaleForDetails.id}</p>
              </div>
              <button 
                onClick={() => setSelectedSaleForDetails(null)} 
                className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-red-500 hover:rotate-90 transition-all duration-300"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-8">
              <div className="max-h-[50vh] overflow-y-auto mb-8 pr-2 scrollbar-hide">
                <Receipt 
                  sale={selectedSaleForDetails} 
                  businessUnit={businessUnit} 
                  branch={branches.find(b => b.id === selectedSaleForDetails.branchId)}
                  allBranches={branches}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Button 
                  onClick={() => generateReceiptPDF(selectedSaleForDetails, businessUnit, branches.find(b => b.id === selectedSaleForDetails.branchId), branches)}
                  className="py-6 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
                >
                  <Printer size={16} />
                  Print Receipt
                </Button>
                <Button 
                  onClick={() => generateInvoicePDF(selectedSaleForDetails, businessUnit, branches.find(b => b.id === selectedSaleForDetails.branchId), branches)}
                  className="py-6 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                >
                  <FileText size={16} />
                  Print Invoice
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {isRefundModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-md overflow-hidden border border-white/20"
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight text-rose-600">Initiate Refund</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Reversing transaction {selectedSale?.id}</p>
              </div>
              <button 
                onClick={() => setIsRefundModalOpen(false)} 
                className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-red-500 hover:rotate-90 transition-all duration-300"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                <p className="text-xs font-bold text-rose-600 leading-relaxed">
                  Warning: This will reverse the sale, restock items, and mark the transaction as refunded. This action cannot be undone.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reason for Refund</label>
                <textarea 
                  className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-rose-500 focus:bg-white transition-all min-h-[120px] placeholder:text-slate-300"
                  placeholder="E.G. CUSTOMER RETURNED ITEMS, WRONG PAYMENT METHOD..."
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <Button 
                  variant="ghost"
                  onClick={() => setIsRefundModalOpen(false)}
                  className="py-6 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={confirmRefund}
                  disabled={!refundReason.trim()}
                  className="py-6 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-100 disabled:opacity-50 disabled:shadow-none"
                >
                  Confirm Refund
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
};

const Reports = ({ sales, products, categories, branches }: { sales: Sale[], products: Product[], categories: Category[], branches: Branch[] }) => {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      const saleDate = sale.timestamp.split('T')[0];
      return saleDate >= startDate && saleDate <= endDate;
    });
  }, [sales, startDate, endDate]);

  const salesByCategory = categories.map(cat => {
    const total = filteredSales.reduce((acc, sale) => {
      const catItems = sale.items.filter(item => {
        const prod = products.find(p => p.id === item.productId);
        return prod?.category === cat.id;
      });
      return acc + catItems.reduce((sum, item) => sum + item.total, 0);
    }, 0);
    return { name: cat.name, value: total };
  }).filter(c => c.value > 0);

  const salesByBranch = branches.map(branch => {
    const total = filteredSales
      .filter(s => s.branchId === branch.id)
      .reduce((acc, s) => acc + (s.subtotal || s.total), 0);
    return { name: branch.name, value: total };
  });

  const totalVat = filteredSales.reduce((acc, s) => acc + (s.tax || 0), 0);
  const totalSales = filteredSales.reduce((acc, s) => acc + s.total, 0);

  const dailyTrend = Array.from({ length: 14 }).map((_, i) => {
    const date = subDays(new Date(), i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const total = sales
      .filter(s => s.timestamp.startsWith(dateStr))
      .reduce((acc, s) => acc + (s.subtotal || s.total), 0);
    const vat = sales
      .filter(s => s.timestamp.startsWith(dateStr))
      .reduce((acc, s) => acc + (s.tax || 0), 0);
    return { date: format(date, 'MMM dd'), total, vat };
  }).reverse();

  const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b'];

  return (
    <div className="space-y-8">
      <Card className="p-6 bg-slate-50/50 border-slate-100">
        <div className="flex flex-col md:flex-row md:items-end gap-6">
          <div className="flex-1 space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Report Start Date</label>
            <input 
              type="date"
              className="w-full p-4 rounded-2xl border-2 border-white bg-white shadow-sm text-sm font-bold text-slate-800 outline-none focus:border-orange-500 transition-all"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Report End Date</label>
            <input 
              type="date"
              className="w-full p-4 rounded-2xl border-2 border-white bg-white shadow-sm text-sm font-bold text-slate-800 outline-none focus:border-orange-500 transition-all"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex gap-4">
            <Card className="px-6 py-3 bg-orange-500 text-white border-none shadow-lg shadow-orange-100">
              <p className="text-[9px] font-black uppercase opacity-80">Total Sales</p>
              <p className="text-xl font-black">GHC {(totalSales || 0).toLocaleString()}</p>
            </Card>
            <Card className="px-6 py-3 bg-slate-900 text-white border-none shadow-lg shadow-slate-200">
              <p className="text-[9px] font-black uppercase opacity-80">VAT Collected</p>
              <p className="text-xl font-black">GHC {(totalVat || 0).toLocaleString()}</p>
            </Card>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-sm font-bold text-slate-500 uppercase">Sales by Category</h4>
            <div className="w-8 h-8 bg-orange-50 text-orange-500 rounded-lg flex items-center justify-center">
              <Tag size={16} />
            </div>
          </div>
          <div className="h-64 min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={100}>
              <PieChart>
                <Pie
                  data={salesByCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {salesByCategory.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [`GHC ${formatCurrency(value)}`, 'Sales']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-sm font-bold text-slate-500 uppercase">Sales by Branch</h4>
            <div className="w-8 h-8 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center">
              <Store size={16} />
            </div>
          </div>
          <div className="h-64 min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={100}>
              <BarChart data={salesByBranch}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(value: number) => [`GHC ${formatCurrency(value)}`, 'Sales']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-sm font-bold text-slate-500 uppercase">VAT Remittance Trend</h4>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Sales</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-900"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">VAT</span>
              </div>
            </div>
          </div>
          <div className="h-80 min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={100}>
              <AreaChart data={dailyTrend}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorVat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: number, name: string) => [`GHC ${formatCurrency(value)}`, name === 'total' ? 'Sales' : 'VAT']}
                />
                <Area type="monotone" dataKey="total" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                <Area type="monotone" dataKey="vat" stroke="#0f172a" strokeWidth={3} fillOpacity={1} fill="url(#colorVat)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">VAT Remittance Summary</h4>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Detailed breakdown for GRA compliance</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => {
              const csv = [
                ['Date', 'Sale ID', 'Branch', 'Subtotal', 'VAT Amount', 'Total'],
                ...filteredSales.map(s => [
                  format(new Date(s.timestamp), 'yyyy-MM-dd HH:mm'),
                  s.id,
                  branches.find(b => b.id === s.branchId)?.name || 'Unknown',
                  formatCurrency(s.subtotal) || '0.00',
                  formatCurrency(s.tax),
                  formatCurrency(s.total) || '0.00'
                ])
              ].map(e => e.join(",")).join("\n");
              
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.setAttribute('hidden', '');
              a.setAttribute('href', url);
              a.setAttribute('download', `VAT_Report_${startDate}_to_${endDate}.csv`);
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
            className="flex items-center gap-2"
          >
            <FileText size={18} />
            Export CSV
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Sale ID</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Branch</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Subtotal</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">VAT</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.slice(0, 10).map(sale => (
                <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-xs font-bold text-slate-600">
                    {format(new Date(sale.timestamp), 'MMM dd, HH:mm')}
                  </td>
                  <td className="px-6 py-4 text-xs font-black text-slate-900">{sale.id}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">
                    {branches.find(b => b.id === sale.branchId)?.name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-600 text-right">
                    ₵{formatCurrency(sale.subtotal)}
                  </td>
                  <td className="px-6 py-4 text-xs font-black text-orange-600 text-right">
                    ₵{formatCurrency(sale.tax)}
                  </td>
                  <td className="px-6 py-4 text-xs font-black text-slate-900 text-right">
                    ₵{formatCurrency(sale.total)}
                  </td>
                </tr>
              ))}
              {filteredSales.length > 10 && (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                    And {filteredSales.length - 10} more transactions...
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white">
                <td className="px-6 py-4 text-sm font-black text-right">₵{formatCurrency(filteredSales.reduce((acc, s) => acc + (s.subtotal || 0), 0))}</td>
                <td className="px-6 py-4 text-sm font-black text-right text-orange-400">₵{formatCurrency(totalVat)}</td>
                <td className="px-6 py-4 text-sm font-black text-right">₵{formatCurrency(totalSales)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
};

const CEOCommandCentre = ({ 
  demoRequests, 
  pricingPlans, 
  allBusinessUnits,
  allUsers,
  allSales,
  allPayments,
  onProvision, 
  onUpdatePricing,
  onExtendTrial,
  onSetPremium
}: { 
  demoRequests: DemoRequest[], 
  pricingPlans: PricingPlan[], 
  allBusinessUnits: BusinessUnit[],
  allUsers: User[],
  allSales: Sale[],
  allPayments: any[],
  onProvision: (req: DemoRequest) => void, 
  onUpdatePricing: (plan: PricingPlan) => void,
  onExtendTrial: (buId: string) => void,
  onSetPremium: (buId: string) => void
}) => {
  const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null);

  const stats = useMemo(() => {
    const totalRevenue = allSales.reduce((acc, sale) => acc + sale.total, 0);
    const activeTenants = allBusinessUnits.filter(bu => bu.subscriptionStatus === 'active').length;
    const trialingTenants = allBusinessUnits.filter(bu => bu.subscriptionStatus === 'trialing').length;
    const expiredTenants = allBusinessUnits.filter(bu => bu.subscriptionStatus === 'expired' || (bu.subscriptionStatus === 'trialing' && new Date(bu.trialEndsAt) < new Date())).length;
    
    // Revenue over time (last 30 days)
    const revenueByDate: { [key: string]: number } = {};
    allSales.forEach(sale => {
      const date = format(new Date(sale.timestamp), 'MMM dd');
      revenueByDate[date] = (revenueByDate[date] || 0) + sale.total;
    });
    
    const chartData = Object.entries(revenueByDate)
      .map(([name, total]) => ({ name, total }))
      .slice(-14); // Last 14 days

    return {
      totalRevenue,
      activeTenants,
      trialingTenants,
      expiredTenants,
      totalUsers: allUsers.length,
      totalTenants: allBusinessUnits.length,
      chartData
    };
  }, [allSales, allBusinessUnits, allUsers]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-slate-800">CEO Command Centre</h3>
        <div className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold uppercase tracking-wider">
          Exclusive Access
        </div>
      </div>

      {/* Ecosystem Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-purple-500 to-indigo-600 text-white border-none shadow-lg shadow-purple-200">
          <p className="text-xs font-bold uppercase opacity-80">Total Ecosystem Revenue</p>
          <p className="text-2xl font-black mt-1">GHC {stats.totalRevenue.toLocaleString()}</p>
          <div className="mt-2 text-[10px] bg-white/20 inline-block px-2 py-0.5 rounded">
            Across {stats.totalTenants} tenants
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-500 uppercase">Total Users</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{stats.totalUsers}</p>
          <div className="mt-2 flex items-center text-xs text-green-600 font-bold">
            <Users size={12} className="mr-1" />
            Global Workforce
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-500 uppercase">Active Subscriptions</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{stats.activeTenants}</p>
          <div className="mt-2 text-xs text-slate-500">
            {stats.trialingTenants} in trial
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-500 uppercase">Trial Conversion Risk</p>
          <p className="text-2xl font-black text-red-600 mt-1">{stats.expiredTenants}</p>
          <div className="mt-2 text-xs text-slate-500">
            Expired/Overdue tenants
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="p-6 lg:col-span-2">
          <h4 className="text-sm font-bold text-slate-500 uppercase mb-6">Ecosystem Revenue Trend</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={100}>
              <AreaChart data={stats.chartData}>
                <defs>
                  <linearGradient id="colorTotalEcosystem" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                <Tooltip />
                <Area type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorTotalEcosystem)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h4 className="text-sm font-bold text-slate-500 uppercase mb-6">SaaS Pricing Management</h4>
          <div className="space-y-4">
            {pricingPlans.map(plan => (
              <div key={plan.id} className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <h5 className="font-bold text-slate-800">{plan.name}</h5>
                  <button onClick={() => setEditingPlan(plan)} className="text-purple-600 hover:text-purple-700">
                    <Settings size={16} />
                  </button>
                </div>
                <p className="text-2xl font-black text-slate-900">GHC {plan.price}</p>
                <p className="text-xs text-slate-500 mt-1">{plan.features.length} features listed</p>
              </div>
            ))}
            <Button 
              variant="outline" 
              className="w-full border-dashed border-2"
              onClick={() => setEditingPlan({ id: '', name: '', price: 0, features: [], updatedAt: '' })}
            >
              <Plus size={18} className="mr-2" />
              Add New Plan
            </Button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="p-6 lg:col-span-2">
          <h4 className="text-sm font-bold text-slate-500 uppercase mb-6">Demo Requests & Provisioning</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Company</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {demoRequests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-800">{req.companyName}</p>
                      <p className="text-xs text-slate-500">{format(new Date(req.createdAt), 'MMM dd, yyyy')}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{req.contactName}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        req.status === 'pending' ? "bg-yellow-100 text-yellow-700" :
                        req.status === 'provisioned' ? "bg-green-100 text-green-700" :
                        "bg-red-100 text-red-700"
                      )}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {req.status === 'pending' && (
                        <Button 
                          onClick={() => onProvision(req)}
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          Provision
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6 flex flex-col justify-center items-center text-center bg-slate-50 border-dashed">
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-4">
            <BarChart3 size={24} />
          </div>
          <h5 className="font-bold text-slate-800">Future Insights</h5>
          <p className="text-xs text-slate-500 mt-2">
            AI-driven growth predictions and churn analysis will appear here as more data is collected.
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h4 className="text-sm font-bold text-slate-500 uppercase mb-6">Recent Subscription Payments (Paystack)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tenant ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Plan</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Reference</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allPayments.map((payment, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-xs font-mono text-slate-600">{payment.businessUnitId}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold uppercase">
                      {payment.planName}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-800">GHC {payment.amount}</td>
                  <td className="px-6 py-4 text-[10px] font-mono text-slate-400">{payment.reference}</td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {format(new Date(payment.timestamp), 'MMM dd, HH:mm')}
                  </td>
                </tr>
              ))}
              {allPayments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                    No subscription payments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h4 className="text-sm font-bold text-slate-500 uppercase mb-6">Tenant Management (Trials & Subscriptions)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Business Unit</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Trial Ends</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allBusinessUnits.map(bu => (
                <tr key={bu.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-800">{bu.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono uppercase">{bu.id}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      bu.subscriptionStatus === 'trialing' ? "bg-blue-100 text-blue-700" :
                      bu.subscriptionStatus === 'active' ? "bg-green-100 text-green-700" :
                      "bg-red-100 text-red-700"
                    )}>
                      {bu.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-600">
                      {bu.trialEndsAt ? format(new Date(bu.trialEndsAt), 'MMM dd, yyyy') : 'N/A'}
                    </p>
                    {bu.subscriptionStatus === 'trialing' && new Date(bu.trialEndsAt) < new Date() && (
                      <p className="text-[10px] text-red-500 font-bold uppercase">Expired</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => onExtendTrial(bu.id)}
                        className="text-xs h-8"
                        title="Extend Trial by 30 Days"
                      >
                        <Calendar size={14} className="mr-1" />
                        +30 Days
                      </Button>
                      <Button 
                        onClick={() => onSetPremium(bu.id)}
                        className="text-xs h-8 bg-orange-500 hover:bg-orange-600 text-white"
                        title="Set to Premium"
                      >
                        <Zap size={14} className="mr-1" />
                        Premium
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AnimatePresence>
        {editingPlan && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-xl font-bold text-slate-800">{editingPlan.id ? 'Edit Plan' : 'Add New Plan'}</h3>
                <button onClick={() => setEditingPlan(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const plan: PricingPlan = {
                  ...editingPlan,
                  name: formData.get('name') as string,
                  price: Number(formData.get('price')),
                  features: (formData.get('features') as string).split(',').map(f => f.trim()),
                  isPopular: formData.get('isPopular') === 'on',
                  updatedAt: new Date().toISOString()
                };
                onUpdatePricing(plan);
                setEditingPlan(null);
              }} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Plan Name</label>
                  <input name="name" defaultValue={editingPlan.name} required className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Price (GHC)</label>
                  <input name="price" type="number" defaultValue={editingPlan.price} required className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Features (comma separated)</label>
                  <textarea name="features" defaultValue={editingPlan.features.join(', ')} required className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-purple-500 h-24" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="isPopular" defaultChecked={editingPlan.isPopular} className="w-4 h-4 text-purple-600" />
                  <label className="text-sm font-medium text-slate-700">Mark as Popular</label>
                </div>
                <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3">
                  Save Pricing Plan
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DemoRequestForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const companyName = formData.get('companyName') as string;
    logEvent({ type: 'button_click', label: 'Submit Demo Request', name: companyName });
    
    try {
      await addDoc(collection(db, 'demoRequests'), {
        companyName: formData.get('companyName'),
        contactName: formData.get('contactName'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      setSubmitted(true);
      toast.success('Demo request sent! Our CEO will contact you soon.');
    } catch (error) {
      toast.error('Failed to send request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center p-8 space-y-4">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
          <ShieldCheck size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-800">Request Received!</h3>
        <p className="text-slate-500">Thank you for your interest in GAM SHOP. We will review your request and get back to you shortly.</p>
        <Button variant="outline" onClick={() => setSubmitted(false)}>Send Another Request</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-white rounded-2xl border border-slate-100 shadow-xl">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-slate-800">Request a Demo</h3>
        <p className="text-sm text-slate-500 text-balance">Experience the future of retail management in Ghana.</p>
      </div>
      <div className="space-y-3">
        <input name="companyName" required placeholder="Company Name" className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-orange-500 transition-all" />
        <input name="contactName" required placeholder="Your Name" className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-orange-500 transition-all" />
        <input name="email" type="email" required placeholder="Email Address" className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-orange-500 transition-all" />
        <input name="phone" required placeholder="Phone Number (MoMo enabled preferred)" className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-orange-500 transition-all" />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-200">
        {isSubmitting ? 'Sending...' : 'Request Demo Access'}
        <Send size={18} className="ml-2" />
      </Button>
    </form>
  );
};

const PricingSection = ({ plans }: { plans: PricingPlan[] }) => {
  return (
    <div className="py-12 space-y-8">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-black text-white tracking-tight">Simple, Transparent Pricing</h3>
        <p className="text-orange-100/70 text-sm">Choose the plan that fits your business size.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans.map(plan => (
          <div 
            key={plan.id} 
            className={cn(
              "relative p-6 rounded-3xl border transition-all duration-300",
              plan.isPopular 
                ? "bg-white border-white shadow-2xl scale-105 z-10" 
                : "bg-white/10 border-white/20 backdrop-blur-md"
            )}
          >
            {plan.isPopular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-orange-500 text-white text-[10px] font-bold uppercase rounded-full tracking-widest">
                Most Popular
              </div>
            )}
            <div className="mb-6">
              <h4 className={cn("text-lg font-bold", plan.isPopular ? "text-slate-800" : "text-white")}>{plan.name}</h4>
              <div className="flex items-baseline gap-1 mt-2">
                <span className={cn("text-3xl font-black", plan.isPopular ? "text-slate-900" : "text-white")}>GHC {plan.price}</span>
                <span className={cn("text-xs", plan.isPopular ? "text-slate-500" : "text-orange-100/60")}>/month</span>
              </div>
            </div>
            <ul className="space-y-3 mb-8">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2">
                  <div className={cn("p-1 rounded-full", plan.isPopular ? "bg-green-100 text-green-600" : "bg-white/20 text-white")}>
                    <Check size={10} strokeWidth={4} />
                  </div>
                  <span className={cn("text-xs font-medium", plan.isPopular ? "text-slate-600" : "text-orange-500/90")}>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

const TrialGuard = ({ businessUnit, pricingPlans, onSelectPlan }: { businessUnit: BusinessUnit, pricingPlans: PricingPlan[], onSelectPlan: (plan: PricingPlan, reference: string) => void }) => {
  const isExpired = businessUnit.subscriptionStatus === 'expired' || (businessUnit.subscriptionStatus === 'trialing' && new Date(businessUnit.trialEndsAt) < new Date());
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);

  const config = {
    reference: (new Date()).getTime().toString(),
    email: businessUnit.ownerUid + "@gamshop.com", // Fallback if email not in BU, but we usually have it in profile
    amount: (selectedPlan?.price || 0) * 100, // Amount in kobo
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
  };

  const initializePayment = usePaystackPayment(config);

  const onSuccess = (reference: any) => {
    if (selectedPlan) {
      onSelectPlan(selectedPlan, reference.reference);
    }
  };

  const onClose = () => {
    toast.error("Payment cancelled");
  };

  if (!isExpired) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8 bg-orange-500 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-3xl font-black tracking-tight">Trial Period Expired</h2>
          <p className="text-orange-100 mt-2">Your 1-month free trial has ended. Please select a plan to continue using GAM SHOP.</p>
        </div>
        
        <div className="p-8 bg-slate-50">
          {!config.publicKey && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
              <AlertTriangle size={20} />
              <p>Paystack Public Key is missing. Please configure VITE_PAYSTACK_PUBLIC_KEY in your environment.</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pricingPlans.map(plan => (
              <Card key={plan.id} className={cn("p-6 flex flex-col", plan.isPopular && "border-orange-500 border-2 shadow-xl")}>
                <div className="mb-6">
                  <h4 className="text-lg font-bold text-slate-800">{plan.name}</h4>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-black text-slate-900">GHC {plan.price}</span>
                    <span className="text-xs text-slate-500">/month</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <div className="p-1 bg-green-100 text-green-600 rounded-full">
                        <Check size={10} strokeWidth={4} />
                      </div>
                      <span className="text-xs font-medium text-slate-600">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  onClick={() => {
                    setSelectedPlan(plan);
                    if (config.publicKey) {
                      // We need to wait for state update or just pass the plan to a function
                      // For simplicity, we'll use a temporary variable or just trigger after render
                    }
                  }} 
                  className={cn("w-full", selectedPlan?.id === plan.id ? "bg-orange-600" : "")}
                >
                  {selectedPlan?.id === plan.id ? "Selected" : `Select ${plan.name}`}
                </Button>
              </Card>
            ))}
          </div>

          {selectedPlan && config.publicKey && (
            <div className="mt-8">
              <Button 
                onClick={() => initializePayment({ onSuccess, onClose })}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-4 text-lg font-bold rounded-2xl shadow-lg shadow-green-200"
              >
                Pay GHC {selectedPlan.price} via Paystack
              </Button>
            </div>
          )}

          <div className="mt-8 text-center">
            <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-slate-600 text-sm font-medium underline">
              Sign out and return later
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const SubscriptionView = ({ businessUnit, pricingPlans, onSelectPlan }: { businessUnit: BusinessUnit, pricingPlans: PricingPlan[], onSelectPlan: (plan: PricingPlan, reference: string) => void }) => {
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  
  const config = {
    reference: (new Date()).getTime().toString(),
    email: businessUnit.ownerUid + "@gamshop.com",
    amount: (selectedPlan?.price || 0) * 100,
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
  };

  const initializePayment = usePaystackPayment(config);

  const onSuccess = (reference: any) => {
    if (selectedPlan) {
      onSelectPlan(selectedPlan, reference.reference);
    }
  };

  const onClose = () => {
    toast.error("Payment cancelled");
  };

  const currentPlan = pricingPlans.find(p => p.id === businessUnit.selectedPlanId);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-slate-800">Subscription & Billing</h3>
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
          businessUnit.subscriptionStatus === 'active' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
        )}>
          {businessUnit.subscriptionStatus}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="p-6 lg:col-span-1 bg-gradient-to-br from-slate-800 to-slate-900 text-white border-none shadow-xl">
          <h4 className="text-sm font-bold uppercase opacity-60 mb-6">Current Plan</h4>
          {currentPlan ? (
            <div className="space-y-4">
              <p className="text-3xl font-black">{currentPlan.name}</p>
              <p className="text-slate-400 text-sm">GHC {currentPlan.price} / month</p>
              <div className="pt-4 border-t border-white/10">
                <p className="text-xs font-bold uppercase opacity-60 mb-2">Features Included:</p>
                <ul className="space-y-2">
                  {currentPlan.features.slice(0, 5).map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                      <Check size={12} className="text-green-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-3xl font-black">Free Trial</p>
              <p className="text-slate-400 text-sm">Ends on {businessUnit.trialEndsAt ? format(new Date(businessUnit.trialEndsAt), 'MMM dd, yyyy') : 'N/A'}</p>
              <p className="text-xs text-orange-400 font-bold uppercase">Upgrade to avoid service interruption</p>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <h4 className="text-sm font-bold text-slate-500 uppercase">Available Plans</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pricingPlans.map(plan => (
              <Card 
                key={plan.id} 
                className={cn(
                  "p-6 cursor-pointer transition-all border-2",
                  selectedPlan?.id === plan.id ? "border-orange-500 shadow-lg" : "border-transparent hover:border-slate-200",
                  businessUnit.selectedPlanId === plan.id && "bg-slate-50 opacity-80"
                )}
                onClick={() => setSelectedPlan(plan)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h5 className="font-bold text-slate-800">{plan.name}</h5>
                    <p className="text-2xl font-black text-slate-900 mt-1">GHC {plan.price}</p>
                  </div>
                  {plan.isPopular && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[10px] font-bold rounded uppercase">Popular</span>
                  )}
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.slice(0, 3).map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-[10px] text-slate-500">
                      <Check size={10} className="text-green-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button 
                  variant={selectedPlan?.id === plan.id ? "primary" : "outline"}
                  className="w-full text-xs h-9"
                  disabled={businessUnit.selectedPlanId === plan.id}
                >
                  {businessUnit.selectedPlanId === plan.id ? "Current Plan" : selectedPlan?.id === plan.id ? "Selected" : "Select Plan"}
                </Button>
              </Card>
            ))}
          </div>

          {selectedPlan && selectedPlan.id !== businessUnit.selectedPlanId && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-orange-50 rounded-2xl border border-orange-100 flex flex-col md:flex-row items-center justify-between gap-4"
            >
              <div>
                <p className="text-sm font-bold text-slate-800">Ready to upgrade to {selectedPlan.name}?</p>
                <p className="text-xs text-slate-500">You will be charged GHC {selectedPlan.price} monthly.</p>
              </div>
              <Button 
                onClick={() => initializePayment({ onSuccess, onClose })}
                className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-6 rounded-xl font-bold shadow-lg shadow-orange-200"
              >
                Pay with Paystack
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

// --- AI Assistant Component ---
const GeminiAssistant = ({ 
  products, 
  sales, 
  branches, 
  staff, 
  businessUnit,
  onNavigate 
}: { 
  products: Product[], 
  sales: Sale[], 
  branches: Branch[], 
  staff: User[], 
  businessUnit: BusinessUnit | null,
  onNavigate: (tab: string) => void
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMessage = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await getBusinessInsights(userMessage, {
        products,
        sales,
        branches,
        staff,
        businessUnit
      });

      setMessages(prev => [...prev, { role: 'assistant', content: response || "I'm sorry, I couldn't process that." }]);
      
      // Simple navigation detection
      const lowerResponse = response?.toLowerCase() || "";
      if (lowerResponse.includes("go to pos") || lowerResponse.includes("open pos")) onNavigate('pos');
      else if (lowerResponse.includes("go to inventory")) onNavigate('inventory');
      else if (lowerResponse.includes("go to dashboard")) onNavigate('dashboard');
      else if (lowerResponse.includes("go to catalog")) onNavigate('catalog');
      else if (lowerResponse.includes("go to staff")) onNavigate('staff');
      else if (lowerResponse.includes("go to branches")) onNavigate('branches');
      else if (lowerResponse.includes("go to reports")) onNavigate('reports');
      else if (lowerResponse.includes("go to settings")) onNavigate('settings');
      
    } catch (error) {
      toast.error("AI Assistant is currently unavailable");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all z-50",
          isOpen ? "bg-slate-800 text-white rotate-90" : "bg-orange-500 text-white hover:scale-110 active:scale-95"
        )}
      >
        {isOpen ? <X size={24} /> : <Sparkles size={24} className="animate-pulse" />}
      </button>

      {/* Assistant Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 w-[90vw] md:w-[400px] h-[600px] max-h-[70vh] bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden z-50"
          >
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
                <Bot size={24} />
              </div>
              <div>
                <h4 className="font-bold text-sm">GAM AI Assistant</h4>
                <p className="text-[10px] text-slate-400">Business Intelligence & Support</p>
              </div>
            </div>

            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {messages.length === 0 && (
                <div className="text-center py-10 space-y-4">
                  <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mx-auto">
                    <Sparkles size={32} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">How can I help you today?</p>
                    <p className="text-xs text-slate-500 px-6">Ask about your sales, stock levels, or help navigating the app.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 px-4">
                    {[
                      "How are my sales today?",
                      "Which items are low in stock?",
                      "Show me items expiring soon",
                      "Go to the POS section"
                    ].map(suggestion => (
                      <button 
                        key={suggestion}
                        onClick={() => { setQuery(suggestion); }}
                        className="text-left p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 hover:border-orange-500 hover:text-orange-600 transition-all"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] p-3 rounded-2xl text-sm shadow-sm",
                    msg.role === 'user' 
                      ? "bg-orange-500 text-white rounded-tr-none" 
                      : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"
                  )}>
                    <div className="markdown-body prose prose-sm max-w-none">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-100 flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-100 flex gap-2">
              <input 
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Ask anything..."
                className="flex-1 bg-slate-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                disabled={isLoading}
              />
              <button 
                type="submit"
                disabled={!query.trim() || isLoading}
                className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-orange-600 transition-colors"
              >
                <Send size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [businessUnit, setBusinessUnit] = useState<BusinessUnit | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    logEvent({ type: 'page_view', page: activeTab });
  }, [activeTab]);
  const [productTemplates, setProductTemplates] = useState<ProductTemplate[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerLedger, setCustomerLedger] = useState<CustomerLedgerEntry[]>([]);

  const isManager = profile?.role === 'manager' || profile?.role === 'supervisor' || profile?.role === 'accountant';
  const branchProducts = useMemo(() => {
    const filtered = profile?.branchId 
      ? products.filter(p => p.branchId === profile?.branchId || p.branchId === 'main') 
      : products;
    console.log(`Branch Products Filtered: ${filtered.length} (Profile Branch: ${profile?.branchId})`);
    return filtered;
  }, [products, profile?.branchId]);
  const branchSales = useMemo(() => 
    profile?.branchId ? sales.filter(s => s.branchId === profile?.branchId || s.branchId === 'main') : sales,
    [sales, profile?.branchId]
  );
  const [allBusinessUnits, setAllBusinessUnits] = useState<BusinessUnit[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        setUser(u);
        if (u) {
          const userDocRef = doc(db, 'users', u.uid);
          const userDocSnap = await getDoc(userDocRef).catch(err => handleFirestoreError(err, OperationType.GET, `users/${u.uid}`));
          
          if (userDocSnap && userDocSnap.exists()) {
            const userData = userDocSnap.data() as User;
            setProfile(userData);
            
            // Fetch Business Unit
            const buDocRef = doc(db, 'businessUnits', userData.businessUnitId);
            const buDocSnap = await getDoc(buDocRef).catch(err => handleFirestoreError(err, OperationType.GET, `businessUnits/${userData.businessUnitId}`));
            if (buDocSnap && buDocSnap.exists()) {
              setBusinessUnit({ id: buDocSnap.id, ...buDocSnap.data() } as BusinessUnit);
            }
          } else {
            // Create new Business Unit for the first-time user (SaaS onboarding)
            const newBuId = `bu_${u.uid.slice(0, 8)}_${Date.now().toString().slice(-4)}`;
            const trialEnds = new Date();
            trialEnds.setMonth(trialEnds.getMonth() + 1);

            const newBu: BusinessUnit = {
              id: newBuId,
              name: `${u.displayName || 'My'} Shop`,
              ownerUid: u.uid,
              createdAt: new Date().toISOString(),
              trialEndsAt: trialEnds.toISOString(),
              subscriptionStatus: 'trialing'
            };
            
            await setDoc(doc(db, 'businessUnits', newBuId), newBu).catch(err => handleFirestoreError(err, OperationType.WRITE, `businessUnits/${newBuId}`));
            setBusinessUnit(newBu);

            // Create Default Branch
            const branchRef = await addDoc(collection(db, 'branches'), {
              name: 'Main Branch',
              businessUnitId: newBuId,
              type: 'store',
              createdAt: new Date().toISOString()
            }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'branches'));

            // Create User Profile linked to Business Unit
            const newProfile: User = {
              uid: u.uid,
              email: u.email!,
              displayName: u.displayName || 'User',
              role: 'manager', // First user is manager
              businessUnitId: newBuId,
              branchId: branchRef ? branchRef.id : 'main',
              createdAt: new Date().toISOString()
            };
            await setDoc(userDocRef, newProfile).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`));
            setProfile(newProfile);
          }
        } else {
          setProfile(null);
          setBusinessUnit(null);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user || !profile?.businessUnitId) return;
    
    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (snap.exists()) {
        const profileData = snap.data() as User;
        setProfile(profileData);
        
        // Ensure at least one branch exists and user is assigned to a real one
        if (profileData.businessUnitId) {
          const qCheckBranches = query(
            collection(db, 'branches'), 
            where('businessUnitId', '==', profileData.businessUnitId)
          );
          const branchSnap = await getDocs(qCheckBranches);
          
          if (branchSnap.empty) {
            console.log('No branches found, creating default...');
            const branchRef = await addDoc(collection(db, 'branches'), {
              name: 'Main Branch',
              businessUnitId: profileData.businessUnitId,
              type: 'store',
              createdAt: new Date().toISOString()
            });
            await updateDoc(doc(db, 'users', user.uid), { branchId: branchRef.id });
            console.log('Created default branch and assigned to user:', branchRef.id);
          } else if (!profileData.branchId || profileData.branchId === 'main') {
            // If profile has no branchId or it's 'main', but branches exist, assign the first one
            const firstBranchId = branchSnap.docs[0].id;
            console.log('User assigned to "main", switching to real branch:', firstBranchId);
            await updateDoc(doc(db, 'users', user.uid), { branchId: firstBranchId });
          }
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    const buId = profile.businessUnitId;
    
    // Remove the old branch check from here

    const qTemplates = query(
      collection(db, 'productTemplates'),
      where('businessUnitId', '==', buId),
      orderBy('createdAt', 'desc')
    );
    const unsubTemplates = onSnapshot(qTemplates, (snap) => {
      setProductTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductTemplate)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'productTemplates'));

    const qProducts = query(
      collection(db, 'products'), 
      where('businessUnitId', '==', buId),
      orderBy('updatedAt', 'desc')
    );
    const unsubProducts = onSnapshot(qProducts, (snap) => {
      const fetchedProducts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      console.log(`Fetched ${fetchedProducts.length} products for BU ${buId}`);
      setProducts(fetchedProducts);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'products'));

    const qSales = query(
      collection(db, 'sales'), 
      where('businessUnitId', '==', buId),
      orderBy('timestamp', 'desc'), 
      limit(100)
    );
    const unsubSales = onSnapshot(qSales, (snap) => {
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'sales'));

    const qShifts = query(
      collection(db, 'shifts'),
      where('businessUnitId', '==', buId),
      orderBy('startTime', 'desc'),
      limit(100)
    );
    const unsubShifts = onSnapshot(qShifts, (snap) => {
      setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'shifts'));

    const qShift = query(
      collection(db, 'shifts'), 
      where('businessUnitId', '==', buId),
      where('userId', '==', user.uid), 
      where('status', '==', 'open'),
      limit(1)
    );
    const unsubShift = onSnapshot(qShift, (snap) => {
      if (!snap.empty) {
        setCurrentShift({ id: snap.docs[0].id, ...snap.docs[0].data() } as Shift);
      } else {
        setCurrentShift(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'shifts/current'));

    const qUsers = query(
      collection(db, 'users'), 
      where('businessUnitId', '==', buId),
      orderBy('createdAt', 'desc')
    );
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setUsers(snap.docs.map(d => ({ ...d.data() } as User)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const qBranches = query(
      collection(db, 'branches'),
      where('businessUnitId', '==', buId)
    );
    const unsubBranches = onSnapshot(qBranches, (snap) => {
      setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Branch)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'branches'));

    const qCategories = query(
      collection(db, 'categories'),
      where('businessUnitId', '==', buId)
    );
    const unsubCategories = onSnapshot(qCategories, (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'categories'));

    const qTransfers = query(
      collection(db, 'stockTransfers'),
      where('businessUnitId', '==', buId),
      orderBy('initiatedAt', 'desc')
    );
    const unsubTransfers = onSnapshot(qTransfers, (snap) => {
      setStockTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() } as StockTransfer)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'stockTransfers'));

    const qCustomers = query(
      collection(db, 'customers'),
      where('businessUnitId', '==', buId),
      orderBy('name', 'asc')
    );
    const unsubCustomers = onSnapshot(qCustomers, (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'customers'));

    const qLedger = query(
      collection(db, 'customerLedger'),
      where('businessUnitId', '==', buId),
      orderBy('timestamp', 'desc'),
      limit(500)
    );
    const unsubLedger = onSnapshot(qLedger, (snap) => {
      setCustomerLedger(snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerLedgerEntry)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'customerLedger'));

    // Public Pricing Data
    const qPricing = query(collection(db, 'pricingPlans'), orderBy('price', 'asc'));
    const unsubPricing = onSnapshot(qPricing, (snap) => {
      setPricingPlans(snap.docs.map(d => ({ id: d.id, ...d.data() } as PricingPlan)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'pricingPlans'));

    // CEO Exclusive Data
    let unsubDemoRequests = () => {};
    let unsubAllBUs = () => {};
    let unsubAllUsers = () => {};
    let unsubAllSales = () => {};
    let unsubAllPayments = () => {};
    if (user.email === 'jamesgambrah@gmail.com') {
      const qDemo = query(collection(db, 'demoRequests'), orderBy('createdAt', 'desc'));
      unsubDemoRequests = onSnapshot(qDemo, (snap) => {
        setDemoRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as DemoRequest)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'demoRequests'));

      const qBUs = query(collection(db, 'businessUnits'), orderBy('createdAt', 'desc'));
      unsubAllBUs = onSnapshot(qBUs, (snap) => {
        setAllBusinessUnits(snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessUnit)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'businessUnits_all'));

      const qAllUsers = query(collection(db, 'users'));
      unsubAllUsers = onSnapshot(qAllUsers, (snap) => {
        setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as User)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users_all'));

      const qAllSales = query(collection(db, 'sales'), orderBy('timestamp', 'desc'), limit(1000));
      unsubAllSales = onSnapshot(qAllSales, (snap) => {
        setAllSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'sales_all'));

      const qAllPayments = query(collection(db, 'subscription_payments'), orderBy('timestamp', 'desc'));
      unsubAllPayments = onSnapshot(qAllPayments, (snap) => {
        setAllPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'subscription_payments_all'));
    }

    return () => {
      unsubProfile();
      unsubTemplates();
      unsubProducts();
      unsubSales();
      unsubShifts();
      unsubShift();
      unsubUsers();
      unsubBranches();
      unsubCategories();
      unsubTransfers();
      unsubPricing();
      unsubCustomers();
      unsubLedger();
      unsubDemoRequests();
      unsubAllBUs();
      unsubAllUsers();
      unsubAllSales();
      unsubAllPayments();
    };
  }, [user, profile?.businessUnitId]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('Welcome back!');
    } catch (err) {
      toast.error('Login failed');
    }
  };

  const handleLogout = () => {
    logEvent({ type: 'button_click', label: 'Logout' });
    signOut(auth);
  };

  const handleAddProduct = async (p: Partial<Product>) => {
    if (!profile?.businessUnitId) return;
    
    logEvent({ 
      type: 'product_added', 
      name: p.name || 'unknown', 
      category: p.category || 'unknown' 
    });

    try {
      const path = 'products';
      const branchId = p.branchId || profile?.branchId || 'main';
      const sku = (p.sku || '').trim();
      const templateId = p.templateId || '';
      const expiryDate = p.expiryDate || '';

      // Check if product with same Template, Branch, and Expiry exists
      // Using templateId is more reliable than SKU as it's the direct link to the catalog
      const q = query(
        collection(db, path),
        where('businessUnitId', '==', profile.businessUnitId),
        where('branchId', '==', branchId),
        where('templateId', '==', templateId),
        where('expiryDate', '==', expiryDate)
      );

      const snap = await getDocs(q).catch(err => handleFirestoreError(err, OperationType.GET, path));
      
      // If not found by templateId + expiry, try SKU + expiry as a fallback for legacy data
      let existingDoc = snap && !snap.empty ? snap.docs[0] : null;
      
      if (!existingDoc && sku) {
        const qSku = query(
          collection(db, path),
          where('businessUnitId', '==', profile.businessUnitId),
          where('branchId', '==', branchId),
          where('sku', '==', sku),
          where('expiryDate', '==', expiryDate)
        );
        const snapSku = await getDocs(qSku).catch(err => handleFirestoreError(err, OperationType.GET, path));
        if (snapSku && !snapSku.empty) {
          existingDoc = snapSku.docs[0];
        }
      }

      if (existingDoc) {
        // Update existing product stock
        const existingData = existingDoc.data() as Product;
        const newStockLevel = (existingData.stockLevel || 0) + (p.stockLevel || 0);
        
        await updateDoc(doc(db, path, existingDoc.id), {
          stockLevel: newStockLevel,
          updatedAt: new Date().toISOString(),
          // Update prices if they changed? Usually we take the latest
          costPrice: p.costPrice || existingData.costPrice,
          price: p.price || existingData.price,
          // Ensure fields are consistent
          sku: sku || existingData.sku,
          templateId: templateId || existingData.templateId,
          expiryDate: expiryDate // Ensure it's set to "" if it was undefined
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `${path}/${existingDoc.id}`));
        
        toast.success(`Updated existing stock for ${p.name}. New total: ${newStockLevel}`);
      } else {
        // Create new product entry
        const productData = {
          ...p,
          sku: sku,
          businessUnitId: profile.businessUnitId,
          updatedAt: new Date().toISOString(),
          branchId: branchId,
          expiryDate: expiryDate
        };
        console.log('Adding New Product:', productData);
        await addDoc(collection(db, path), productData).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
        toast.success('Product added successfully');
      }
    } catch (err) {
      console.error('Error adding product:', err);
      toast.error('Failed to add product');
    }
  };

  const handleUpdateProduct = async (id: string, data: Partial<Product>) => {
    if (!profile?.businessUnitId) return;
    try {
      const path = 'products';
      await updateDoc(doc(db, path, id), {
        ...data,
        updatedAt: new Date().toISOString()
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      // No toast here to avoid spamming in bulk updates, will handle in bulk logic
    } catch (err) {
      console.error('Failed to update product', err);
      throw err;
    }
  };

  const handleAddTemplate = async (t: Partial<ProductTemplate>) => {
    if (!profile?.businessUnitId) return;
    logEvent({ type: 'button_click', label: 'Add Product Template', name: t.name });
    try {
      const path = 'productTemplates';
      
      // Check if SKU already exists
      if (t.sku) {
        const q = query(
          collection(db, path), 
          where('businessUnitId', '==', profile.businessUnitId),
          where('sku', '==', t.sku)
        );
        const snapshot = await getDocs(q).catch(err => handleFirestoreError(err, OperationType.GET, path));
        if (snapshot && !snapshot.empty) {
          toast.error(`A product with SKU "${t.sku}" already exists in the catalog.`);
          return;
        }
      }

      await addDoc(collection(db, path), {
        ...t,
        businessUnitId: profile.businessUnitId,
        createdAt: new Date().toISOString()
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
      toast.success('Product template created');
    } catch (err) {
      toast.error('Failed to create template');
    }
  };

  const handleUpdateTemplate = async (id: string, t: Partial<ProductTemplate>) => {
    if (!profile?.businessUnitId) return;
    try {
      const path = `productTemplates/${id}`;

      // Check if new SKU already exists (if SKU is being updated)
      if (t.sku) {
        const q = query(
          collection(db, 'productTemplates'), 
          where('businessUnitId', '==', profile.businessUnitId),
          where('sku', '==', t.sku)
        );
        const snapshot = await getDocs(q).catch(err => handleFirestoreError(err, OperationType.GET, 'productTemplates'));
        if (snapshot && !snapshot.empty) {
          const duplicate = snapshot.docs.find(doc => doc.id !== id);
          if (duplicate) {
            toast.error(`Another product with SKU "${t.sku}" already exists.`);
            return;
          }
        }
      }

      await updateDoc(doc(db, 'productTemplates', id), {
        ...t,
        updatedAt: new Date().toISOString()
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      toast.success('Product template updated');
    } catch (err) {
      toast.error('Failed to update template');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!profile?.businessUnitId) return;
    try {
      const path = `productTemplates/${id}`;
      await deleteDoc(doc(db, 'productTemplates', id)).catch(err => handleFirestoreError(err, OperationType.DELETE, path));
      toast.success('Product template deleted');
    } catch (err) {
      toast.error('Failed to delete template');
    }
  };

  const handleAddStaff = async (u: Partial<User>) => {
    if (!profile?.businessUnitId) return;
    logEvent({ type: 'button_click', label: 'Add Staff', name: u.displayName });
    try {
      // In a real SaaS, we'd send an invite. For demo, we create a placeholder profile.
      // When the user with this email logs in, they'll be linked.
      const tempId = `staff_${Date.now()}`;
      const path = `users/${tempId}`;
      await setDoc(doc(db, 'users', tempId), {
        ...u,
        uid: tempId,
        businessUnitId: profile.businessUnitId,
        createdAt: new Date().toISOString(),
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));

      // Sync branch managerId if this user is a manager and assigned to a branch
      if (u.branchId && (u.role === 'manager' || u.role === 'supervisor')) {
        const branchRef = doc(db, 'branches', u.branchId);
        await updateDoc(branchRef, {
          managerId: tempId
        }).catch(err => console.warn("Could not sync branch managerId", err));
      }
      
      toast.success('Staff member added');
    } catch (err) {
      toast.error('Failed to add staff');
    }
  };

  const handleUpdateStaff = async (uid: string, data: Partial<User>) => {
    if (!profile?.businessUnitId) return;
    try {
      const path = `users/${uid}`;
      await updateDoc(doc(db, 'users', uid), data).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      
      // Sync branch managerId if this user is a manager and assigned to a branch
      if (data.branchId && (data.role === 'manager' || data.role === 'supervisor')) {
        const branchRef = doc(db, 'branches', data.branchId);
        await updateDoc(branchRef, {
          managerId: uid
        }).catch(err => console.warn("Could not sync branch managerId", err));
      }
      
      toast.success('Staff member updated');
    } catch (err) {
      toast.error('Failed to update staff');
    }
  };

  const handleDeleteStaff = async (uid: string) => {
    if (!profile?.businessUnitId) return;
    try {
      const path = `users/${uid}`;
      await deleteDoc(doc(db, 'users', uid)).catch(err => handleFirestoreError(err, OperationType.DELETE, path));
      toast.success('Staff member deleted');
    } catch (err) {
      toast.error('Failed to delete staff');
    }
  };

  const handleAddBranch = async (b: Partial<Branch>) => {
    if (!profile?.businessUnitId) return;
    logEvent({ type: 'button_click', label: 'Add Branch', name: b.name });
    try {
      const path = 'branches';
      const docRef = await addDoc(collection(db, path), {
        ...b,
        businessUnitId: profile.businessUnitId,
        createdAt: new Date().toISOString(),
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
      
      if (docRef && b.managerId) {
        // Sync the manager's branchId to this new branch
        await updateDoc(doc(db, 'users', b.managerId), {
          branchId: docRef.id
        }).catch(err => console.warn("Could not sync manager branchId", err));
      }
      
      toast.success('Branch added');
    } catch (err) {
      toast.error('Failed to add branch');
    }
  };

  const handleInitiateTransfer = async (t: Partial<StockTransfer>) => {
    if (!profile?.businessUnitId || !user) return;
    logEvent({ type: 'button_click', label: 'Initiate Stock Transfer', name: t.productName, value: t.quantity });
    try {
      const path = 'stockTransfers';
      await runTransaction(db, async (transaction) => {
        // 1. Get the source product
        const sourceProductRef = doc(db, 'products', t.productId!);
        const sourceProductSnap = await transaction.get(sourceProductRef);
        
        if (!sourceProductSnap.exists()) {
          throw new Error("Source product not found");
        }
        
        const sourceProduct = sourceProductSnap.data() as Product;
        if (sourceProduct.stockLevel < t.quantity!) {
          throw new Error("Insufficient stock");
        }

        // 2. Create the transfer record
        const transferRef = doc(collection(db, path));
        transaction.set(transferRef, {
          ...t,
          businessUnitId: profile.businessUnitId,
          initiatedBy: user.uid,
          initiatedAt: new Date().toISOString(),
          status: 'pending'
        });

        // 3. Deduct from source
        transaction.update(sourceProductRef, {
          stockLevel: sourceProduct.stockLevel - t.quantity!,
          updatedAt: new Date().toISOString()
        });
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
      toast.success('Stock transfer initiated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to initiate transfer');
    }
  };

  const handleReceiveTransfer = async (transferId: string) => {
    if (!profile?.businessUnitId || !user) return;
    try {
      const path = `stockTransfers/${transferId}`;
      await runTransaction(db, async (transaction) => {
        const transferRef = doc(db, 'stockTransfers', transferId);
        const transferSnap = await transaction.get(transferRef);
        
        if (!transferSnap.exists()) throw new Error("Transfer not found");
        const transfer = transferSnap.data() as StockTransfer;
        
        if (transfer.status !== 'pending') throw new Error("Transfer already processed");

        // 1. Find or create product in destination branch
        const q = query(
          collection(db, 'products'),
          where('businessUnitId', '==', profile.businessUnitId),
          where('branchId', '==', transfer.destinationBranchId),
          where('templateId', '==', transfer.templateId)
        );
        const destProductsSnap = await getDocs(q).catch(err => handleFirestoreError(err, OperationType.GET, 'products'));
        
        if (destProductsSnap && !destProductsSnap.empty) {
          // Update existing
          const destProductRef = doc(db, 'products', destProductsSnap.docs[0].id);
          const destProduct = destProductsSnap.docs[0].data() as Product;
          transaction.update(destProductRef, {
            stockLevel: destProduct.stockLevel + transfer.quantity,
            updatedAt: new Date().toISOString()
          });
        } else {
          // Create new from template
          const templateRef = doc(db, 'productTemplates', transfer.templateId);
          const templateSnap = await transaction.get(templateRef);
          if (!templateSnap.exists()) throw new Error("Product template not found");
          const template = templateSnap.data() as ProductTemplate;
          
          const newProductRef = doc(collection(db, 'products'));
          transaction.set(newProductRef, {
            businessUnitId: profile.businessUnitId,
            templateId: template.id,
            name: template.name,
            sku: template.sku,
            barcode: template.barcode || '',
            brand: template.brand || '',
            category: template.category || '',
            unit: template.unit || 'Pcs',
            price: template.sellingPrice || 0,
            costPrice: template.costPrice || 0,
            stockLevel: transfer.quantity,
            reorderPoint: 10,
            branchId: transfer.destinationBranchId,
            updatedAt: new Date().toISOString()
          });
        }

        // 2. Update transfer status
        transaction.update(transferRef, {
          status: 'received',
          receivedBy: user.uid,
          receivedAt: new Date().toISOString()
        });
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      toast.success('Stock received and inventory updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to receive stock');
    }
  };

  const handleCancelTransfer = async (transferId: string) => {
    if (!profile?.businessUnitId) return;
    try {
      const path = `stockTransfers/${transferId}`;
      await runTransaction(db, async (transaction) => {
        const transferRef = doc(db, 'stockTransfers', transferId);
        const transferSnap = await transaction.get(transferRef);
        
        if (!transferSnap.exists()) throw new Error("Transfer not found");
        const transfer = transferSnap.data() as StockTransfer;
        
        if (transfer.status !== 'pending') throw new Error("Cannot cancel processed transfer");

        // 1. Return stock to source
        const sourceProductRef = doc(db, 'products', transfer.productId);
        const sourceProductSnap = await transaction.get(sourceProductRef);
        if (sourceProductSnap.exists()) {
          const sourceProduct = sourceProductSnap.data() as Product;
          transaction.update(sourceProductRef, {
            stockLevel: sourceProduct.stockLevel + transfer.quantity,
            updatedAt: new Date().toISOString()
          });
        }

        // 2. Update status
        transaction.update(transferRef, {
          status: 'cancelled'
        });
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      toast.success('Transfer cancelled and stock returned');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel transfer');
    }
  };

  const handleAddCategory = async (name: string) => {
    if (!profile?.businessUnitId) return;
    logEvent({ type: 'button_click', label: 'Add Category', name });
    try {
      const path = 'categories';
      await addDoc(collection(db, path), {
        name,
        businessUnitId: profile.businessUnitId,
        createdAt: new Date().toISOString(),
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
      toast.success('Category added');
    } catch (err) {
      toast.error('Failed to add category');
    }
  };

  const handleAddCustomer = async (customerData: Partial<Customer>) => {
    try {
      const path = 'customers';
      const customerRef = doc(collection(db, path));
      await setDoc(customerRef, {
        ...customerData,
        id: customerRef.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
      toast.success('Customer added successfully');
    } catch (err) {
      toast.error('Failed to add customer');
    }
  };

  const handleUpdateCustomer = async (id: string, customerData: Partial<Customer>) => {
    try {
      const path = `customers/${id}`;
      await updateDoc(doc(db, 'customers', id), {
        ...customerData,
        updatedAt: new Date().toISOString()
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      toast.success('Customer updated');
    } catch (err) {
      toast.error('Failed to update customer');
    }
  };

  const handleAddCustomerPayment = async (customerId: string, amount: number, note: string, paymentMethod: 'cash' | 'card' | 'momo' = 'cash', shiftId?: string) => {
    if (!profile?.businessUnitId || !user?.uid) return;
    
    try {
      await runTransaction(db, async (transaction) => {
        const customerRef = doc(db, 'customers', customerId);
        const customerSnap = await transaction.get(customerRef);
        
        if (customerSnap.exists()) {
          const customerData = customerSnap.data() as Customer;
          const newBalance = (customerData.currentBalance || 0) - amount;
          
          transaction.update(customerRef, {
            currentBalance: newBalance,
            updatedAt: new Date().toISOString()
          });
          
          const ledgerRef = doc(collection(db, 'customerLedger'));
          transaction.set(ledgerRef, {
            id: ledgerRef.id,
            customerId,
            businessUnitId: profile.businessUnitId,
            type: 'payment',
            amount,
            balanceAfter: newBalance,
            paymentMethod,
            shiftId,
            note: note || `Payment received via ${paymentMethod}`,
            timestamp: new Date().toISOString(),
            clerkId: user.uid
          } as CustomerLedgerEntry);
        }
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'payment_transaction'));
      
      toast.success('Payment recorded successfully');
    } catch (err) {
      toast.error('Failed to record payment');
    }
  };

  const handleSaleComplete = async (saleData: Partial<Sale>) => {
    if (!profile?.businessUnitId || !user?.uid) {
      console.error("User profile or UID missing:", { profile, user });
      toast.error("User profile not loaded");
      return;
    }
    
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const counterId = `${profile.businessUnitId}_${profile.branchId || 'main'}_${today}`;
      const counterRef = doc(db, 'counters', counterId);
      
      console.log('Starting sale transaction:', { counterId, userId: user.uid, businessUnitId: profile.businessUnitId });
      
      let finalSaleId = '';
      let finalSaleData: any = null;

      await runTransaction(db, async (transaction) => {
        // 1. Pre-fetch data (READS MUST BE FIRST)
        const counterSnap = await transaction.get(counterRef).catch(err => {
          console.error("Transaction get counter error:", err);
          throw err;
        });

        let customerSnap = null;
        if (saleData.paymentMethod === 'credit' && saleData.customerId) {
          const customerRef = doc(db, 'customers', saleData.customerId);
          customerSnap = await transaction.get(customerRef);
        }

        // 2. Process Counter
        let newCount = 1;
        if (counterSnap.exists()) {
          newCount = counterSnap.data().count + 1;
        }
        
        transaction.set(counterRef, { count: newCount, date: today }, { merge: true });

        // 3. Prepare Sale Data
        finalSaleId = formatSaleId(today, newCount);
        const salePath = 'sales';
        const rawSaleData = {
          ...saleData,
          id: finalSaleId,
          clerkId: user.uid,
          clerkName: profile.displayName || 'Unknown',
          branchId: profile?.branchId || 'main',
          businessUnitId: profile.businessUnitId,
          status: 'completed',
          timestamp: new Date().toISOString(),
        };

        finalSaleData = Object.fromEntries(
          Object.entries(rawSaleData).filter(([_, v]) => v !== undefined)
        );

        // 3. Create Sale Record
        const saleRef = doc(db, salePath, finalSaleId);
        transaction.set(saleRef, finalSaleData);

        // 4. Update customer balance if credit sale
        if (customerSnap && customerSnap.exists()) {
          const customerData = customerSnap.data() as Customer;
          const newBalance = (customerData.currentBalance || 0) + (saleData.total || 0);
          
          const customerRef = doc(db, 'customers', saleData.customerId!);
          transaction.update(customerRef, {
            currentBalance: newBalance,
            updatedAt: new Date().toISOString()
          });
          
          // Add ledger entry
          const ledgerRef = doc(collection(db, 'customerLedger'));
          transaction.set(ledgerRef, {
            id: ledgerRef.id,
            customerId: saleData.customerId,
            businessUnitId: profile.businessUnitId,
            type: 'sale',
            amount: saleData.total,
            balanceAfter: newBalance,
            referenceId: finalSaleId,
            note: `Credit sale: ${finalSaleId}`,
            timestamp: new Date().toISOString(),
            clerkId: user.uid
          } as CustomerLedgerEntry);
        }
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'sales_transaction'));

      // 4. Update stock levels
      for (const item of saleData.items!) {
        const productPath = `products/${item.productId}`;
        const productRef = doc(db, 'products', item.productId);
        const productSnap = await getDoc(productRef).catch(err => handleFirestoreError(err, OperationType.GET, productPath));
        
        if (productSnap && productSnap.exists()) {
          const productData = productSnap.data() as Product;
          
          // Bundle Logic: Deduct stock from constituent products
          const template = productTemplates.find(t => t.id === productData.templateId);
          if (template?.isBundle && template.bundleItems) {
            for (const bundleItem of template.bundleItems) {
              const q = query(
                collection(db, 'products'),
                where('businessUnitId', '==', profile.businessUnitId),
                where('branchId', '==', productData.branchId),
                where('templateId', '==', bundleItem.templateId),
                limit(1)
              );
              const componentSnap = await getDocs(q).catch(() => null);
              if (componentSnap && !componentSnap.empty) {
                const componentDoc = componentSnap.docs[0];
                const componentRef = doc(db, 'products', componentDoc.id);
                const currentComponentStock = componentDoc.data().stockLevel || 0;
                const deduction = bundleItem.quantity * item.quantity;
                
                await updateDoc(componentRef, {
                  stockLevel: currentComponentStock - deduction,
                  updatedAt: new Date().toISOString()
                }).catch(err => console.error(`Failed to update bundle component ${bundleItem.templateId}:`, err));
              }
            }
          }

          const currentStock = productData.stockLevel || 0;
          const newStock = currentStock - item.quantity;
          
          console.log(`Updating product ${item.productId} stock: ${currentStock} -> ${newStock}`);
          
          logEvent({ type: 'stock_updated', productId: item.productId, newStock });

          await updateDoc(productRef, {
            stockLevel: newStock,
            updatedAt: new Date().toISOString()
          }).catch(err => {
            console.error(`Product update error (${item.productId}):`, err);
            return handleFirestoreError(err, OperationType.UPDATE, productPath);
          });
        } else {
          console.warn(`Product ${item.productId} not found for stock update`);
        }
      }

      toast.success('Sale completed! Receipt generated.');
      setLastSale({ id: finalSaleId, ...finalSaleData } as Sale);
    } catch (err) {
      console.error("Sale process failed:", err);
      toast.error('Transaction failed. Please check console for details.');
    }
  };

  const handleRefundSale = async (sale: Sale, reason: string) => {
    if (!profile?.businessUnitId || profile.role !== 'manager') {
      toast.error("Only managers can process refunds");
      return;
    }

    logEvent({ type: 'button_click', label: 'Refund Sale', id: sale.id });

    try {
      const salePath = `sales/${sale.id}`;
      const saleRef = doc(db, 'sales', sale.id);
      
      // 1. Update sale status
      await updateDoc(saleRef, {
        status: 'refunded',
        refundedAt: new Date().toISOString(),
        refundedBy: profile.displayName || user?.email,
        refundReason: reason
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, salePath));

      // 2. Restore stock levels
      for (const item of sale.items) {
        const productPath = `products/${item.productId}`;
        const productRef = doc(db, 'products', item.productId);
        const productSnap = await getDoc(productRef).catch(err => handleFirestoreError(err, OperationType.GET, productPath));
        if (productSnap && productSnap.exists()) {
          const productData = productSnap.data() as Product;

          // Bundle Logic: Restore stock to constituent products
          const template = productTemplates.find(t => t.id === productData.templateId);
          if (template?.isBundle && template.bundleItems) {
            for (const bundleItem of template.bundleItems) {
              const q = query(
                collection(db, 'products'),
                where('businessUnitId', '==', profile.businessUnitId),
                where('branchId', '==', productData.branchId),
                where('templateId', '==', bundleItem.templateId),
                limit(1)
              );
              const componentSnap = await getDocs(q).catch(() => null);
              if (componentSnap && !componentSnap.empty) {
                const componentDoc = componentSnap.docs[0];
                const componentRef = doc(db, 'products', componentDoc.id);
                const currentComponentStock = componentDoc.data().stockLevel || 0;
                const restoration = bundleItem.quantity * item.quantity;
                
                await updateDoc(componentRef, {
                  stockLevel: currentComponentStock + restoration,
                  updatedAt: new Date().toISOString()
                }).catch(err => console.error(`Failed to restore bundle component ${bundleItem.templateId}:`, err));
              }
            }
          }

          const currentStock = productData.stockLevel;
          const newStock = currentStock + item.quantity;
          
          logEvent({ type: 'stock_updated', productId: item.productId, newStock });

          await updateDoc(productRef, {
            stockLevel: newStock,
            updatedAt: new Date().toISOString()
          }).catch(err => handleFirestoreError(err, OperationType.UPDATE, productPath));
        }
      }

      toast.success("Sale refunded and stock restored");
    } catch (error) {
      console.error("Refund failed:", error);
      toast.error("Failed to process refund");
    }
  };

  const openShift = async () => {
    const amount = prompt('Enter opening cash amount (GHC):');
    if (amount === null || !profile?.businessUnitId) return;
    
    try {
      const path = 'shifts';
      await addDoc(collection(db, path), {
        businessUnitId: profile.businessUnitId,
        userId: user?.uid,
        userName: profile?.displayName || 'Unknown',
        startTime: new Date().toISOString(),
        openingCash: Number(amount),
        status: 'open',
        branchId: profile?.branchId || 'main'
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
      toast.success('Shift opened');
    } catch (err) {
      toast.error('Failed to open shift');
    }
  };

  const handleUpdateBU = async (data: Partial<BusinessUnit>) => {
    if (!businessUnit?.id) return;
    try {
      const path = `businessUnits/${businessUnit.id}`;
      await updateDoc(doc(db, 'businessUnits', businessUnit.id), data).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      setBusinessUnit(prev => prev ? { ...prev, ...data } : null);
      toast.success('Settings updated');
    } catch (err) {
      toast.error('Update failed');
    }
  };

  const handleProvision = async (req: DemoRequest) => {
    try {
      const toastId = toast.loading(`Provisioning ${req.companyName}...`);
      
      // 1. Create Business Unit
      const buId = `bu_${req.companyName.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString().slice(-4)}`;
      const trialEnds = new Date();
      trialEnds.setMonth(trialEnds.getMonth() + 1);

      const newBu: BusinessUnit = {
        id: buId,
        name: req.companyName,
        ownerUid: 'PENDING_INVITATION', // In a real app, we'd send an invite link
        createdAt: new Date().toISOString(),
        trialEndsAt: trialEnds.toISOString(),
        subscriptionStatus: 'trialing'
      };
      const buPath = `businessUnits/${buId}`;
      await setDoc(doc(db, 'businessUnits', buId), newBu).catch(err => handleFirestoreError(err, OperationType.WRITE, buPath));

      // 2. Update Demo Request Status
      const demoPath = `demoRequests/${req.id}`;
      await updateDoc(doc(db, 'demoRequests', req.id), {
        status: 'provisioned'
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, demoPath));

      toast.dismiss(toastId);
      toast.success(`${req.companyName} provisioned successfully!`);
    } catch (error) {
      toast.error('Provisioning failed');
    }
  };

  const handleUpdatePricing = async (plan: PricingPlan) => {
    try {
      if (plan.id) {
        const path = `pricingPlans/${plan.id}`;
        await updateDoc(doc(db, 'pricingPlans', plan.id), { ...plan }).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      } else {
        const path = 'pricingPlans';
        await addDoc(collection(db, path), { ...plan, id: `plan_${Date.now()}` }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
      }
      toast.success('Pricing updated');
    } catch (error) {
      toast.error('Failed to update pricing');
    }
  };

  const handleExtendTrial = async (buId: string) => {
    try {
      const bu = allBusinessUnits.find(b => b.id === buId);
      if (!bu) return;
      
      const currentEnd = new Date(bu.trialEndsAt);
      currentEnd.setMonth(currentEnd.getMonth() + 1);
      
      const path = `businessUnits/${buId}`;
      await updateDoc(doc(db, 'businessUnits', buId), {
        trialEndsAt: currentEnd.toISOString(),
        subscriptionStatus: 'trialing', // Ensure it's back to trialing if it was expired
        updatedAt: new Date().toISOString()
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      toast.success('Trial extended by 30 days');
    } catch (error) {
      toast.error('Failed to extend trial');
    }
  };

  const handleSetPremium = async (buId: string) => {
    try {
      const path = `businessUnits/${buId}`;
      await updateDoc(doc(db, 'businessUnits', buId), {
        subscriptionStatus: 'active',
        updatedAt: new Date().toISOString()
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      toast.success('Tenant set to Premium');
    } catch (error) {
      toast.error('Failed to set premium status');
    }
  };

  const handleSubscribe = async (plan: PricingPlan, reference: string) => {
    if (!businessUnit?.id) return;
    try {
      const toastId = toast.loading(`Processing subscription for ${plan.name}...`);
      const buPath = `businessUnits/${businessUnit.id}`;
      await updateDoc(doc(db, 'businessUnits', businessUnit.id), {
        subscriptionStatus: 'active',
        selectedPlanId: plan.id,
        paymentReference: reference,
        updatedAt: new Date().toISOString()
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, buPath));
      
      // Log the subscription payment
      const paymentPath = 'subscription_payments';
      await addDoc(collection(db, paymentPath), {
        businessUnitId: businessUnit.id,
        planId: plan.id,
        planName: plan.name,
        amount: plan.price,
        reference: reference,
        timestamp: new Date().toISOString()
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, paymentPath));

      toast.dismiss(toastId);
      toast.success(`Welcome to the ${plan.name} plan!`);
    } catch (error) {
      toast.error('Subscription failed. Please contact support.');
    }
  };

  const handleOpenShift = async (openingCash: number) => {
    if (!profile || !businessUnit) return;
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const counterId = `shifts_${businessUnit.id}_${profile.branchId || 'main'}_${today}`;
      const counterRef = doc(db, 'counters', counterId);
      
      let displayId = '';
      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        let count = 1;
        if (counterSnap.exists()) {
          count = counterSnap.data().count + 1;
          transaction.update(counterRef, { count });
        } else {
          transaction.set(counterRef, { count: 1 });
        }
        
        const datePart = today.replace(/-/g, '').slice(2); // YYMMDD
        const countPart = count.toString().padStart(3, '0'); // 001
        displayId = `SH-${datePart}-${countPart}`;
      });

      const newShift: Omit<Shift, 'id'> = {
        displayId,
        businessUnitId: businessUnit.id,
        userId: profile.uid,
        userName: profile.displayName || 'Unknown',
        branchId: profile.branchId || 'main',
        startTime: new Date().toISOString(),
        openingCash,
        status: 'open'
      };
      const path = 'shifts';
      logEvent({ type: 'button_click', label: 'Open Shift' });
      await addDoc(collection(db, path), newShift).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
      toast.success(`Shift ${displayId} opened successfully`);
    } catch (error) {
      console.error('Failed to open shift:', error);
      toast.error('Failed to open shift');
    }
  };

  const handleCloseShift = async (shiftId: string, closingCash: number, expectedCash: number) => {
    try {
      const path = `shifts/${shiftId}`;
      logEvent({ type: 'button_click', label: 'Close Shift', id: shiftId });
      await updateDoc(doc(db, 'shifts', shiftId), {
        endTime: new Date().toISOString(),
        closingCash,
        expectedCash,
        status: 'submitted'
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      toast.success('Shift submitted for review');
    } catch (error) {
      toast.error('Failed to close shift');
    }
  };

  const handleApproveShift = async (shiftId: string, notes: string) => {
    if (!profile) return;
    try {
      const path = `shifts/${shiftId}`;
      await updateDoc(doc(db, 'shifts', shiftId), {
        status: 'closed',
        reviewedBy: profile.uid,
        reviewedAt: new Date().toISOString(),
        notes
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, path));
      toast.success('Shift closed and approved');
    } catch (error) {
      toast.error('Failed to approve shift');
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">GAM SHOP...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-orange-500 to-orange-600 p-4 overflow-y-auto">
        <div className="max-w-md w-full space-y-8 my-8">
          <div className="text-center">
            <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto mb-6 transform -rotate-6">
              <Store size={40} className="text-orange-500" />
            </div>
            <h1 className="text-5xl font-black text-white tracking-tighter mb-2">GAM SHOP</h1>
            <p className="text-orange-100 text-lg font-medium">Retail SaaS Management</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 shadow-2xl space-y-6">
            <Button 
              onClick={handleLogin}
              className="w-full py-4 bg-white text-slate-900 hover:bg-slate-50 text-lg font-bold rounded-2xl flex items-center justify-center gap-3 shadow-xl"
            >
              <img src="https://www.google.com/favicon.ico" className="w-6 h-6" alt="Google" />
              Sign in with Google
            </Button>
            <p className="text-center text-orange-100/60 text-sm">
              Secure multi-tenant access for your retail business
            </p>
          </div>

          {pricingPlans.length > 0 && (
            <PricingSection plans={pricingPlans} />
          )}

          <div className="pt-8">
            <DemoRequestForm />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Toaster position="top-right" />
      
      {businessUnit && (
        <TrialGuard 
          businessUnit={businessUnit} 
          pricingPlans={pricingPlans} 
          onSelectPlan={handleSubscribe} 
        />
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-100 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-orange-500 text-white rounded-lg">
            <Store size={24} />
          </div>
          <span className="text-xl font-black text-slate-800 tracking-tight">GAM SHOP</span>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto pr-2">
          <SidebarItem 
            icon={LayoutDashboard} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          {profile?.role === 'manager' && (
            <SidebarItem 
              icon={BarChart3} 
              label="Global Overview" 
              active={activeTab === 'global'} 
              onClick={() => setActiveTab('global')} 
            />
          )}
          <SidebarItem 
            icon={ShoppingCart} 
            label="Point of Sale" 
            active={activeTab === 'pos'} 
            onClick={() => setActiveTab('pos')} 
          />
          <SidebarItem 
            icon={Package} 
            label="Inventory" 
            active={activeTab === 'inventory'} 
            onClick={() => setActiveTab('inventory')} 
          />
          <SidebarItem 
            icon={AlertTriangle} 
            label="Inventory Health" 
            active={activeTab === 'alerts'} 
            onClick={() => setActiveTab('alerts')} 
          />
          {['manager', 'supervisor', 'inventory'].includes(profile?.role || '') && (
            <SidebarItem 
              icon={BookOpen} 
              label="Product Catalog" 
              active={activeTab === 'catalog'} 
              onClick={() => setActiveTab('catalog')} 
            />
          )}
          {['manager', 'supervisor', 'inventory', 'warehouse'].includes(profile?.role || '') && (
            <SidebarItem 
              icon={ArrowRightLeft} 
              label="Stock Transfers" 
              active={activeTab === 'transfers'} 
              onClick={() => setActiveTab('transfers')} 
            />
          )}
          {profile?.role === 'manager' && (
            <SidebarItem 
              icon={Store} 
              label="Branches" 
              active={activeTab === 'branches'} 
              onClick={() => setActiveTab('branches')} 
            />
          )}
          {profile?.role === 'manager' && (
            <SidebarItem 
              icon={Zap} 
              label="Subscription" 
              active={activeTab === 'subscription'} 
              onClick={() => setActiveTab('subscription')} 
            />
          )}
          {['manager', 'supervisor', 'accountant'].includes(profile?.role || '') && (
            <SidebarItem 
              icon={Calendar} 
              label="Shifts" 
              active={activeTab === 'shifts'} 
              onClick={() => setActiveTab('shifts')} 
            />
          )}
          {['manager', 'supervisor', 'accountant'].includes(profile?.role || '') && (
            <SidebarItem 
              icon={BarChart3} 
              label="Reports" 
              active={activeTab === 'reports'} 
              onClick={() => setActiveTab('reports')} 
            />
          )}
          {['manager', 'supervisor', 'accountant', 'clerk'].includes(profile?.role || '') && (
            <SidebarItem 
              icon={Archive} 
              label="Sales Archive" 
              active={activeTab === 'sales-history'} 
              onClick={() => setActiveTab('sales-history')} 
            />
          )}
          {profile?.role === 'manager' && (
            <SidebarItem 
              icon={BookOpen} 
              label="Customers" 
              active={activeTab === 'customers'} 
              onClick={() => setActiveTab('customers')} 
            />
          )}
          {profile?.role === 'manager' && (
            <SidebarItem 
              icon={Users} 
              label="Staff" 
              active={activeTab === 'staff'} 
              onClick={() => setActiveTab('staff')} 
            />
          )}
          <SidebarItem 
            icon={Settings} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />

          {user.email === 'jamesgambrah@gmail.com' && (
            <div className="pt-4 mt-4 border-t border-slate-100">
              <p className="px-4 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Admin Only</p>
              <SidebarItem 
                icon={ShieldCheck} 
                label="CEO Centre" 
                active={activeTab === 'ceo'} 
                onClick={() => setActiveTab('ceo')} 
              />
            </div>
          )}
        </nav>

        <div className="pt-6 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
              <img src={user.photoURL || ''} alt="" referrerPolicy="no-referrer" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{user.displayName}</p>
              <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-100 px-8 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800 capitalize">{activeTab}</h2>
            <p className="text-sm text-slate-500">Welcome back, {user.displayName}</p>
          </div>
          
          <div className="flex items-center gap-4">
            {!isOnline && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg border border-red-100 animate-pulse">
                <WifiOff size={14} />
                <span className="text-[10px] font-black uppercase tracking-wider">Offline Mode</span>
              </div>
            )}
            {!currentShift ? (
              <Button variant="outline" onClick={openShift} className="border-orange-200 text-orange-600 hover:bg-orange-50">
                Open Shift
              </Button>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2 bg-orange-50 text-orange-700 rounded-lg border border-orange-100">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                <span className="text-sm font-bold">Shift Active</span>
              </div>
            )}
            <div 
              onClick={() => setActiveTab('alerts')}
              className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors cursor-pointer relative"
            >
              <AlertTriangle size={20} />
              {(branchProducts.filter(p => p.stockLevel <= p.reorderPoint).length > 0 || 
                branchProducts.filter(p => {
                  const expiry = new Date(p.expiryDate);
                  const diff = expiry.getTime() - new Date().getTime();
                  return diff > 0 && diff < (30 * 24 * 60 * 60 * 1000);
                }).length > 0) && (
                <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence>
            {lastSale && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-6"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Sale Receipt</h3>
                    <button onClick={() => setLastSale(null)} className="text-slate-400 hover:text-slate-600">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    <Receipt sale={lastSale} businessUnit={businessUnit} allBranches={branches} />
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <Button 
                        variant="outline" 
                        className="flex-1 flex items-center gap-2" 
                        onClick={() => generateReceiptPDF(lastSale, businessUnit, branches.find(b => b.id === lastSale.branchId), branches)}
                      >
                        <Printer size={16} />
                        POS Receipt
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1 flex items-center gap-2" 
                        onClick={() => generateInvoicePDF(lastSale, businessUnit, branches.find(b => b.id === lastSale.branchId), branches)}
                      >
                        <Printer size={16} />
                        A4 Invoice
                      </Button>
                    </div>
                    <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={() => setLastSale(null)}>
                      Done
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && <Dashboard sales={branchSales} products={branchProducts} onNavigate={setActiveTab} />}
              {activeTab === 'customers' && (
                <Customers 
                  customers={customers}
                  ledger={customerLedger}
                  onAddCustomer={handleAddCustomer}
                  onUpdateCustomer={handleUpdateCustomer}
                  onAddPayment={handleAddCustomerPayment}
                  clerkId={user?.uid || ''}
                  businessUnitId={profile?.businessUnitId || ''}
                  currentShift={currentShift}
                />
              )}
              {activeTab === 'alerts' && <InventoryAlerts products={branchProducts} onNavigate={setActiveTab} />}
              {activeTab === 'global' && <GlobalOverview sales={sales} products={products} branches={branches} />}
              {activeTab === 'pos' && (
                <POS 
                  products={branchProducts} 
                  productTemplates={productTemplates}
                  onSaleComplete={handleSaleComplete} 
                  customers={customers}
                  currentShift={currentShift}
                  onOpenShift={handleOpenShift}
                  onCloseShift={(closing, expected) => currentShift && handleCloseShift(currentShift.id, closing, expected)}
                  sales={branchSales}
                  businessUnit={businessUnit}
                  ledger={customerLedger}
                  branches={branches}
                />
              )}
              {activeTab === 'inventory' && (
                <Inventory 
                  products={branchProducts} 
                  categories={categories}
                  branches={branches}
                  onAddProduct={handleAddProduct} 
                  onUpdateProduct={handleUpdateProduct}
                  onAddCategory={handleAddCategory}
                  templates={productTemplates}
                  profile={profile!}
                />
              )}
              {activeTab === 'catalog' && (
                <ProductCatalog 
                  templates={productTemplates}
                  onAddTemplate={handleAddTemplate}
                  onUpdateTemplate={handleUpdateTemplate}
                  onDeleteTemplate={handleDeleteTemplate}
                  categories={categories}
                />
              )}
              {activeTab === 'branches' && (
                <Branches 
                  branches={branches} 
                  users={users}
                  onAddBranch={handleAddBranch} 
                />
              )}
              {activeTab === 'transfers' && (
                <StockTransfers 
                  transfers={stockTransfers} 
                  products={products} 
                  branches={branches} 
                  onInitiate={handleInitiateTransfer} 
                  onReceive={handleReceiveTransfer} 
                  onCancel={handleCancelTransfer}
                  profile={profile}
                />
              )}
              {activeTab === 'subscription' && businessUnit && (
                <SubscriptionView 
                  businessUnit={businessUnit} 
                  pricingPlans={pricingPlans} 
                  onSelectPlan={handleSubscribe} 
                />
              )}

              {activeTab === 'staff' && (
                <Staff 
                  users={users} 
                  branches={branches}
                  onAddStaff={handleAddStaff}
                  onUpdateStaff={handleUpdateStaff}
                  onDeleteStaff={handleDeleteStaff}
                />
              )}
              {activeTab === 'shifts' && ['manager', 'supervisor', 'accountant'].includes(profile?.role || '') && (
                <ShiftReview 
                  shifts={shifts} 
                  users={users}
                  onApproveShift={handleApproveShift} 
                  sales={sales}
                  ledger={customerLedger}
                  businessUnit={businessUnit}
                  branches={branches}
                />
              )}
              {activeTab === 'reports' && (
                <Reports 
                  sales={sales} 
                  products={products} 
                  categories={categories} 
                  branches={branches} 
                />
              )}
              {activeTab === 'sales-history' && (
                <SalesArchive 
                  sales={sales} 
                  onRefund={handleRefundSale} 
                  profile={profile} 
                  businessUnit={businessUnit}
                  branches={branches}
                />
              )}
              {activeTab === 'ceo' && user.email === 'jamesgambrah@gmail.com' && (
                <CEOCommandCentre 
                  demoRequests={demoRequests} 
                  pricingPlans={pricingPlans}
                  allBusinessUnits={allBusinessUnits}
                  allUsers={allUsers}
                  allSales={allSales}
                  allPayments={allPayments}
                  onProvision={handleProvision} 
                  onUpdatePricing={handleUpdatePricing}
                  onExtendTrial={handleExtendTrial}
                  onSetPremium={handleSetPremium}
                />
              )}
              {activeTab === 'settings' && (
                <div className="max-w-2xl space-y-6">
                  <Card className="p-6 space-y-4">
                    <h3 className="text-lg font-bold text-slate-800">Shop Configuration</h3>
                    <form 
                      className="space-y-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        handleUpdateBU({
                          name: formData.get('name') as string,
                          tin: formData.get('tin') as string,
                          location: formData.get('location') as string,
                          vatRate: parseFloat(formData.get('vatRate') as string) || 20,
                        });
                      }}
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Shop Name</label>
                          <input name="name" defaultValue={businessUnit?.name} className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">GRA TIN</label>
                          <input name="tin" defaultValue={businessUnit?.tin || 'P0012345678'} className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Location</label>
                          <input name="location" defaultValue={businessUnit?.location || 'Accra, Ghana'} className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">VAT Rate (%)</label>
                          <input 
                            name="vatRate" 
                            type="number" 
                            min="0"
                            max="100"
                            step="0.01"
                            defaultValue={businessUnit?.vatRate ?? 20} 
                            className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-orange-500" 
                          />
                          <p className="text-[10px] text-slate-400">Default is 20% (GRA Standard). Managers can adjust this for specific business needs.</p>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button type="submit">Save Changes</Button>
                      </div>
                    </form>
                  </Card>
                  <Card className="p-6 space-y-4">
                    <h3 className="text-lg font-bold text-slate-800">Shop ID (Tenant Isolation)</h3>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 font-mono text-xs text-slate-500 break-all">
                      {businessUnit?.id}
                    </div>
                    <p className="text-xs text-slate-400 italic">This ID isolates your shop data from other tenants on the GAM SHOP platform.</p>
                  </Card>
                  <Card className="p-6 space-y-4">
                    <h3 className="text-lg font-bold text-slate-800">GRA E-VAT Integration</h3>
                    <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500 text-white rounded-lg">
                          <ChevronRight size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-green-800">Connected to GRA Portal</p>
                          <p className="text-xs text-green-600">Real-time tax reporting active</p>
                        </div>
                      </div>
                      <Button variant="outline" className="bg-white">Configure</Button>
                    </div>
                  </Card>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
    <GeminiAssistant 
      products={products}
      sales={sales}
      branches={branches}
      staff={users}
      businessUnit={businessUnit}
      onNavigate={(tab) => setActiveTab(tab)}
    />
    </ErrorBoundary>
  );
}
