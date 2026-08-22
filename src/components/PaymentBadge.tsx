import { CreditCard, Banknote, AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  paymentMethod?: string;
  paymentStatus?: string;
  orderType?: string;
}

export default function PaymentBadge({ paymentMethod, paymentStatus, orderType }: Props) {
  // Determine label and style
  let label = '';
  let icon: React.ReactNode = null;
  let className = '';

  if (paymentMethod === 'ONLINE') {
    if (paymentStatus === 'PAID') {
      label = 'Paid Online';
      icon = <CreditCard className="w-3 h-3" />;
      className = 'bg-green-500/20 text-green-400 border-green-500/40';
    } else if (paymentStatus === 'REFUNDED') {
      label = 'Refunded';
      icon = <RotateCcw className="w-3 h-3" />;
      className = 'bg-red-500/20 text-red-400 border-red-500/40';
    } else if (paymentStatus === 'FAILED') {
      label = 'Payment Failed';
      icon = <AlertCircle className="w-3 h-3" />;
      className = 'bg-red-500/20 text-red-400 border-red-500/40';
    } else {
      label = 'Online Payment';
      icon = <CreditCard className="w-3 h-3" />;
      className = 'bg-blue-500/20 text-blue-400 border-blue-500/40';
    }
  } else {
    // COD or no paymentMethod (legacy/dine-in)
    if (paymentStatus === 'PAID') {
      label = 'Paid';
      icon = <Banknote className="w-3 h-3" />;
      className = 'bg-green-500/20 text-green-400 border-green-500/40';
    } else if (orderType === 'DINE_IN') {
      label = 'Pay at Counter';
      icon = <Banknote className="w-3 h-3" />;
      className = 'bg-gray-500/20 text-gray-400 border-gray-500/40';
    } else {
      label = 'Cash on Delivery';
      icon = <Banknote className="w-3 h-3" />;
      className = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    }
  }

  if (!label) return null;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${className}`}>
      {icon}
      {label}
    </span>
  );
}
