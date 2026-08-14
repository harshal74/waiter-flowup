import { useState, FormEvent } from 'react';
import { User, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { staff, updateStaff } = useAuth();
  const [name,    setName]    = useState(staff?.name         || '');
  const [mobile,  setMobile]  = useState(staff?.mobile       || '');
  const [imgUrl,  setImgUrl]  = useState(staff?.profileImage || '');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() && !mobile.trim() && imgUrl === staff?.profileImage) {
      setError('No changes to save'); return;
    }
    setSaving(true);
    try {
      const res = await API.put('/staff/profile', {
        name: name.trim() || undefined,
        mobile: mobile.trim() || undefined,
        profileImage: imgUrl,
      });
      updateStaff(res.data.data);
      toast.success('Profile updated!');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update profile');
    } finally { setSaving(false); }
  };

  const roleColor: Record<string, string> = {
    CHEF:      'bg-orange-500/20 text-orange-400',
    WAITER:    'bg-blue-500/20 text-blue-400',
    ASSISTANT: 'bg-purple-500/20 text-purple-400',
    ADMIN:     'bg-primary-500/20 text-primary-400',
  };

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Profile</h1>
        <p className="text-gray-400 text-sm mt-1">Manage your staff account</p>
      </div>

      {/* Avatar card */}
      <div className="card p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-primary-500/20 flex items-center justify-center shrink-0">
          {staff?.profileImage
            ? <img src={staff.profileImage} alt={staff.name} className="w-full h-full object-cover" />
            : <User className="w-8 h-8 text-primary-400" />
          }
        </div>
        <div>
          <p className="font-bold text-white text-lg">{staff?.name}</p>
          <p className="text-sm text-gray-400">{staff?.email}</p>
          <span className={`badge text-xs mt-1 ${roleColor[staff?.role || 'ASSISTANT']}`}>
            {staff?.role}
          </span>
        </div>
      </div>

      {/* Edit form */}
      <div className="card p-6">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input type="text" className="input" value={name}
              onChange={e => setName(e.target.value)} placeholder="Your name" disabled={saving} />
          </div>

          <div>
            <label className="label">Email</label>
            <input type="email" className="input opacity-60 cursor-not-allowed"
              value={staff?.email || ''} readOnly />
            <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
          </div>

          <div>
            <label className="label">Mobile</label>
            <input type="tel" className="input" value={mobile}
              onChange={e => setMobile(e.target.value)} placeholder="+91 XXXXXXXXXX" disabled={saving} />
          </div>

          <div>
            <label className="label">Profile Image URL</label>
            <input type="url" className="input" value={imgUrl}
              onChange={e => setImgUrl(e.target.value)}
              placeholder="https://example.com/photo.jpg" disabled={saving} />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Save className="w-4 h-4" /> Save Changes</>
            }
          </button>
        </form>
      </div>

      {/* Info */}
      <div className="card p-5 space-y-2 text-sm">
        <p className="font-semibold text-gray-300">Account Info</p>
        <div className="flex justify-between text-gray-400">
          <span>Role</span><span className="text-white">{staff?.role}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Status</span>
          <span className={staff?.isActive ? 'text-green-400' : 'text-red-400'}>
            {staff?.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        {staff?.lastLogin && (
          <div className="flex justify-between text-gray-400">
            <span>Last login</span>
            <span className="text-white text-xs">{new Date(staff.lastLogin).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
