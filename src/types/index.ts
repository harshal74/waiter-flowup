export type StaffRole = 'ADMIN' | 'CHEF' | 'WAITER' | 'ASSISTANT';

export interface Staff {
  _id: string;
  name: string;
  email: string;
  mobile: string;
  role: StaffRole;
  restaurantId: string;
  isActive: boolean;
  lastLogin: string | null;
  profileImage: string;
}

export type OrderStatus =
  | 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY'
  | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

export interface OrderItem {
  menuId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  itemNote?: string;
  image?: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  restaurantId: string;
  customerId: { _id: string; name: string; mobile: string; address?: string } | null;
  orderType: 'DINE_IN' | 'DELIVERY' | 'TAKE_AWAY';
  tableNumber: number | null;
  items: OrderItem[];
  totalItems: number;
  subtotalAmount: number;
  deliveryCharge: number;
  totalAmount: number;
  note: string;
  address: string;
  deliveryLocation?: { latitude: number; longitude: number } | null;
  status: OrderStatus;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  paymentMethod: 'COD' | 'ONLINE';
  billId: string | null;
  acceptedBy?: string | null;
  preparedBy?: string | null;
  servedBy?: string | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WaiterRequest {
  _id: string;
  restaurantId: string;
  tableNumber: number;
  customerName: string;
  status: 'PENDING' | 'ACCEPTED' | 'COMPLETED';
  requestType?: 'WAITER' | 'BILL';
  createdAt: string;
}

export interface Bill {
  _id: string;
  restaurantId: string;
  tableNumber: number | null;
  orderIds: string[];
  items: { menuItemId?: string; name: string; quantity: number; price: number; total: number }[];
  subtotal: number;
  gst: number;
  /** SGST amount — present on new bills; absent on legacy bills */
  sgst?: number;
  /** CGST amount — present on new bills; absent on legacy bills */
  cgst?: number;
  discount: number;
  grandTotal: number;
  paymentStatus: 'Pending' | 'Paid' | 'Failed' | 'Refunded';
  paymentMethod: 'Cash' | 'UPI' | 'Card';
  invoiceNumber: string;
  paidAt: string | null;
  createdAt: string;
  /** Split billing — absent / "NONE" on single-payment bills */
  splitType?: 'NONE' | 'EQUAL' | 'BY_ITEM' | 'CUSTOM';
  splits?: import('../components/SplitBill').BillSplit[];
  paidAmount?: number;
  remainingAmount?: number;
}
