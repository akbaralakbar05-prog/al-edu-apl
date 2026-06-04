import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, onSnapshot, query, serverTimestamp, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { 
  BookOpen, Users, BrainCircuit, LayoutDashboard, Settings, LogOut, 
  ChevronRight, Search, Bell, Menu, X, PlayCircle, FileText, 
  CheckCircle, Clock, Trophy, MessageSquare, Send, Sparkles, 
  BarChart3, Plus, Trash2, Edit, ChevronLeft, Download, AlertTriangle, HelpCircle, Camera, Activity, Lock, Mail, Archive
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyDnS7Ih3kcotvFZDc5Zw0NlZ2CWvyt-B1M",
  authDomain: "al-edu-app-9a1a7.firebaseapp.com",
  projectId: "al-edu-app-9a1a7",
  storageBucket: "al-edu-app-9a1a7.firebasestorage.app",
  messagingSenderId: "1025187241510",
  appId: "1:1025187241510:web:b8d51d142b8450b29690e7"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'al-edu-app';

// Path Gambar Latar Belakang (Pastikan file ini ada di folder public Anda)
const BG_IMAGE_URL = '/IMG-20260224-WA0075.jpg';
const BG_PRESETS = [
  { label: '🌅 Default', value: 'default', style: `url(${BG_IMAGE_URL})` },
  { label: '🟠 Orange', value: 'orange', style: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 50%, #fdba74 100%)' },
  { label: '🌊 Biru', value: 'blue', style: 'linear-gradient(135deg, #eff6ff 0%, #bfdbfe 50%, #93c5fd 100%)' },
  { label: '🌿 Hijau', value: 'green', style: 'linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 50%, #86efac 100%)' },
  { label: '🌸 Merah Muda', value: 'pink', style: 'linear-gradient(135deg, #fdf2f8 0%, #fbcfe8 50%, #f9a8d4 100%)' },
  { label: '🌙 Gelap', value: 'dark', style: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' },
  { label: '☁️ Putih Bersih', value: 'white', style: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' },
];

// --- Contexts ---
const AppContext = createContext(null);

// Helper untuk Lokasi Database
const getPublicCollection = (collectionName) => collection(db, 'artifacts', appId, 'public', 'data', collectionName);
const getUserCollection = (userId, collectionName) => collection(db, 'artifacts', appId, 'users', userId, collectionName);

// --- Gemini API Helper ---
const callGeminiAPI = async (prompt, systemInstruction = "", useJson = false, jsonSchema = null, imageBase64 = null, imageMimeType = null) => {
  const url = `/api/gemini`;

  // Gambar/dokumen harus di-push SEBELUM teks
  const parts = [];
  if (imageBase64 && imageMimeType) {
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    parts.push({ inlineData: { mimeType: imageMimeType, data: base64Data } });
  }

  // Jika butuh JSON, tambahkan instruksi di prompt (lebih stabil dari responseSchema)
  const finalPrompt = useJson
    ? prompt + `

PENTING: Balas HANYA dengan JSON valid, tanpa penjelasan, tanpa markdown, tanpa backtick.`
    : prompt;
  parts.push({ text: finalPrompt });

  const payload = { contents: [{ parts }] };
  if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  // Hanya pakai responseMimeType tanpa responseSchema (lebih kompatibel)
  if (useJson) payload.generationConfig = { responseMimeType: "application/json", temperature: 0.3 };

  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < 6; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemini-1.5-flash', payload })
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = errBody?.error?.message || `HTTP ${response.status}`;
        throw new Error(msg);
      }
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Respons AI kosong");
      return text;
    } catch (error) {
      if (i === 5) throw new Error("Gagal: " + error.message);
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};

// Helper: bersihkan dan parse JSON dari respons Gemini
const parseGeminiJSON = (text) => {
  if (!text) throw new Error("Teks kosong");
  // Hapus markdown backtick jika ada
  let clean = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  // Coba parse langsung
  try { return JSON.parse(clean); } catch(e) {}
  // Coba ekstrak JSON dari dalam teks
  const match = clean.match(/[\[\{][\s\S]*[\]\}]/);
  if (match) return JSON.parse(match[0]);
  throw new Error("Format JSON tidak valid");
};

// Toast Notification System
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'error' ? 'bg-rose-500' : type === 'success' ? 'bg-emerald-500' : 'bg-blue-500';
  return (
    <div className={`fixed bottom-4 right-4 ${bgColor} text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-2 animate-bounce-short z-50`}>
      {type === 'success' ? <CheckCircle size={20} /> : <Bell size={20} />}
      <p className="font-medium text-sm">{message}</p>
    </div>
  );
};

// --- Reusable UI Components ---
const Button = ({ children, variant = 'primary', className = '', icon: Icon, ...props }) => {
  const baseStyle = "inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-200 focus:ring-orange-500",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-orange-50 shadow-sm focus:ring-orange-200",
    danger: "bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-200 focus:ring-rose-500",
    ghost: "bg-transparent text-slate-600 hover:bg-orange-50 hover:text-orange-600"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

const Card = ({ children, className = '', hover = false }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-soft p-6 ${hover ? 'transition-all duration-300 hover:shadow-xl hover:-translate-y-1' : ''} ${className}`}>
    {children}
  </div>
);

const Input = ({ label, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <input 
      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors text-slate-900 text-sm"
      {...props}
    />
  </div>
);

// --- Background Global Wrapper (baca dari localStorage untuk admin) ---
const GlobalBackground = ({ children }) => {
  const [bgStyle, setBgStyle] = useState(() => {
    try {
      const saved = localStorage.getItem('al_edu_bg');
      if (saved) {
        const found = BG_PRESETS.find(p => p.value === saved);
        if (found) return found.style;
      }
    } catch(e) {}
    return BG_PRESETS[0].style;
  });

  const isImage = bgStyle.startsWith('url(');
  return (
    <div className="min-h-screen relative font-sans selection:bg-orange-100">
      <div className="absolute inset-0 z-0 bg-cover bg-center bg-fixed" style={isImage ? { backgroundImage: bgStyle, backgroundColor: '#fff7ed' } : { background: bgStyle }}>
        <div className="absolute inset-0 bg-orange-50/80 backdrop-blur-[2px]"></div>
      </div>
      <div className="relative z-10 flex flex-col min-h-screen">
        {children}
      </div>
    </div>
  );
};

// --- Pages ---
const LandingPage = ({ onStart }) => {
  return (
    <GlobalBackground>
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-orange-100 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-amber-500 flex items-center justify-center text-white font-bold text-xl shadow-lg">AL</div>
            <span className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-orange-900 to-slate-800">Edu.</span>
          </div>
          <Button onClick={onStart}>Masuk / Daftar Portal</Button>
        </div>
      </nav>

      <main className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex-1">
        <div className="text-center space-y-8 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 border border-orange-200 text-orange-800 font-medium text-sm shadow-sm">
            <Sparkles size={16} /> Platform Belajar Matematika Interaktif
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Belajar Matematika <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 drop-shadow-sm">Lebih Menyenangkan</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-700 leading-relaxed font-medium">
            Kuasai konsep matematika dari dasar hingga mahir dengan materi interaktif, kuis pintar, dan bantuan AI Tutor 24/7 untuk hasil belajar yang maksimal.
          </p>
          <div className="flex justify-center gap-4 pt-4">
            <Button onClick={onStart} className="px-8 py-4 text-lg shadow-xl shadow-orange-500/20">Mulai Belajar Sekarang</Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-24">
          <Card hover className="text-center shadow-lg bg-white/95">
            <div className="w-16 h-16 mx-auto bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 mb-6">
              <BookOpen size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Materi Terstruktur</h3>
            <p className="text-slate-600">Video, PDF, dan latihan soal yang disusun oleh guru berpengalaman untuk pemahaman maksimal.</p>
          </Card>
          <Card hover className="text-center relative overflow-hidden shadow-lg bg-white/95">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <BrainCircuit size={120} />
            </div>
            <div className="w-16 h-16 mx-auto bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 mb-6">
              <BrainCircuit size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">AL-AI Tutor</h3>
            <p className="text-slate-600">Asisten cerdas yang siap membantu Anda menjawab soal dan menjelaskan konsep kapan saja.</p>
          </Card>
          <Card hover className="text-center shadow-lg bg-white/95">
            <div className="w-16 h-16 mx-auto bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 mb-6">
              <Archive size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Bank Soal & Kuis</h3>
            <p className="text-slate-600">Unduh dokumen referensi bank soal dan kerjakan kuis latihan dari guru untuk meraih skor terbaik.</p>
          </Card>
        </div>
      </main>
    </GlobalBackground>
  );
};

// --- AUTHENTICATION MODAL SYSTEM ---
const AuthPortal = ({ onLoginSuccess }) => {
  const [authMode, setAuthMode] = useState('login'); 
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [role, setRole] = useState('Siswa');
  const [loading, setLoading] = useState(false);
  const { showToast } = useContext(AppContext);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) { showToast("Harap isi semua kolom!", "error"); return; }
    if (password.length < 6) { showToast("Kata sandi minimal 6 karakter!", "error"); return; }
    setLoading(true);
    try {
      const querySnap = await getDocs(query(getPublicCollection('users')));
      const usersList = querySnap.docs.map(doc => doc.data());

      // Cek email sudah terdaftar
      const emailExists = usersList.some(u => u.email.toLowerCase() === email.toLowerCase());
      if (emailExists) {
        showToast("Email ini sudah terdaftar! Gunakan email lain.", "error"); setLoading(false); return;
      }

      // BLOK: 1 nama hanya boleh 1 role - cek apakah nama sudah dipakai
      const namaExists = usersList.some(u => u.nama.toLowerCase() === name.trim().toLowerCase());
      if (namaExists) {
        showToast("Nama ini sudah terdaftar dengan role lain! Setiap nama hanya boleh memiliki 1 akun.", "error"); 
        setLoading(false); return;
      }

      // Paksa role = Siswa jika bukan Admin yang mendaftar
      // (Guru & Admin hanya bisa dibuat oleh Admin dari panel manajemen)
      const finalRole = 'Siswa';

      const userId = 'user_' + Math.random().toString(36).substring(2, 9);
      const newProfile = { id: userId, nama: name.trim(), email: email.trim().toLowerCase(), password: password, role: finalRole, createdAt: new Date().toISOString() };
      await setDoc(doc(getPublicCollection('users'), userId), newProfile);
      showToast("Registrasi Berhasil! Akun Siswa dibuat. Silakan Login.", "success");
      setAuthMode('login'); setName(''); setPassword('');
    } catch (err) { showToast("Gagal melakukan pendaftaran.", "error"); } finally { setLoading(false); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) { showToast("Harap isi semua kolom login!", "error"); return; }
    setLoading(true);
    try {
      const q = query(getPublicCollection('users'));
      const querySnap = await getDocs(q);
      const matchedUser = querySnap.docs.map(d => d.data()).find(u => 
        (u.nama.toLowerCase() === name.toLowerCase() || u.email.toLowerCase() === name.toLowerCase()) && u.password === password
      );
      if (matchedUser) { showToast(`Selamat datang, ${matchedUser.nama}!`, "success"); onLoginSuccess(matchedUser); } 
      else { showToast("Nama/Email atau Kata Sandi salah!", "error"); }
    } catch (err) { showToast("Terjadi kesalahan sistem saat masuk.", "error"); } finally { setLoading(false); }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !newPassword.trim()) { showToast("Harap lengkapi semua data!", "error"); return; }
    setLoading(true);
    try {
      const querySnap = await getDocs(query(getPublicCollection('users')));
      let matchedDocId = null;
      querySnap.forEach((d) => {
        const data = d.data();
        if (data.nama.toLowerCase() === name.toLowerCase() && data.email.toLowerCase() === email.toLowerCase()) { matchedDocId = d.id; }
      });
      if (matchedDocId) {
        await setDoc(doc(getPublicCollection('users'), matchedDocId), { password: newPassword }, { merge: true });
        showToast("Kata sandi berhasil diperbarui! Silakan login.", "success");
        setAuthMode('login'); setPassword(''); setNewPassword('');
      } else { showToast("Nama dan Email tidak ditemukan di database!", "error"); }
    } catch (err) { showToast("Gagal merubah kata sandi.", "error"); } finally { setLoading(false); }
  };

  return (
    <GlobalBackground>
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border border-orange-200 bg-white/95 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-bl-full pointer-events-none"></div>
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-extrabold text-2xl mx-auto shadow-md shadow-orange-200">AL</div>
            <h2 className="text-2xl font-extrabold text-slate-900 mt-4">{authMode === 'login' ? 'Masuk ke Portal AL Edu' : authMode === 'register' ? 'Daftar Akun Baru' : 'Ubah Kata Sandi Baru'}</h2>
            <p className="text-slate-500 text-xs mt-1">Platform Pembelajaran Matematika Premium</p>
          </div>

          {authMode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <Input label="Nama Lengkap atau Email" placeholder="Contoh: budi@email.com" value={name} onChange={e => setName(e.target.value)} required />
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-medium text-slate-700">Kata Sandi</label>
                  <button type="button" onClick={() => setAuthMode('forgot')} className="text-xs text-orange-600 font-bold hover:underline">Lupa Kata Sandi?</button>
                </div>
                <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-slate-900 text-sm" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" disabled={loading} className="w-full py-3 mt-2">{loading ? 'Memproses...' : 'Masuk Portal'}</Button>
              <p className="text-center text-xs text-slate-500 pt-4">Belum punya akun? <button type="button" onClick={() => setAuthMode('register')} className="text-orange-600 font-bold hover:underline">Daftar Akun</button></p>
            </form>
          )}

          {authMode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <Input label="Nama Lengkap" placeholder="Contoh: Budi Santoso" value={name} onChange={e => setName(e.target.value)} required />
              <Input label="Alamat Email" type="email" placeholder="contoh@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
              <Input label="Kata Sandi Baru" type="password" placeholder="Minimal 6 karakter" value={password} onChange={e => setPassword(e.target.value)} required />
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2">
                <span className="text-blue-600 text-lg">🎓</span>
                <div>
                  <p className="text-xs font-bold text-blue-800">Akun Siswa</p>
                  <p className="text-xs text-blue-600">Pendaftaran publik hanya untuk role Siswa. Guru & Admin dibuat oleh Admin.</p>
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full py-3 mt-2">{loading ? 'Mendaftarkan...' : 'Daftar Sekarang'}</Button>
              <p className="text-center text-xs text-slate-500 pt-4">Sudah memiliki akun? <button type="button" onClick={() => setAuthMode('login')} className="text-orange-600 font-bold hover:underline">Masuk Portal</button></p>
            </form>
          )}

          {authMode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-xs text-slate-500 bg-orange-50 p-3 rounded-xl border border-orange-100">Konfirmasikan data akun Anda untuk mengubah kata sandi.</p>
              <Input label="Nama Lengkap Terdaftar" placeholder="Budi Santoso" value={name} onChange={e => setName(e.target.value)} required />
              <Input label="Email Terdaftar" type="email" placeholder="budi@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
              <Input label="Kata Sandi Baru" type="password" placeholder="Sandi baru pengganti" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              <Button type="submit" disabled={loading} className="w-full py-3 mt-2">{loading ? 'Memproses...' : 'Perbarui Kata Sandi'}</Button>
              <div className="text-center pt-2"><button type="button" onClick={() => setAuthMode('login')} className="text-xs text-slate-500 font-semibold hover:underline">Kembali ke Halaman Login</button></div>
            </form>
          )}
        </Card>
      </div>
    </GlobalBackground>
  );
};

// --- LAYOUT & DASHBOARD COMPONENT ---
const Layout = ({ children }) => {
  const { profile, setView, setProfile, showToast } = useContext(AppContext);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = {
    Admin: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'users', label: 'Manajemen Pengguna', icon: Users },
      { id: 'tampilan', label: 'Atur Tampilan', icon: Settings },
    ],
    Guru: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'materi', label: 'Kelola Materi', icon: BookOpen },
      { id: 'kuis', label: 'Kelola Kuis', icon: FileText },
      { id: 'bank_soal', label: 'Bank Soal', icon: Archive },
    ],
    Siswa: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'materi', label: 'Belajar', icon: BookOpen },
      { id: 'kuis', label: 'Kuis & Latihan', icon: Trophy },
      { id: 'bank_soal', label: 'Bank Soal', icon: Archive },
      { id: 'ai', label: 'AL-AI Tutor', icon: BrainCircuit },
    ]
  };
  const items = profile ? navItems[profile.role] : [];

  const handleProfilePicUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { showToast('Maksimal ukuran foto adalah 500KB', 'error'); return; }
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64Img = event.target.result;
        await setDoc(doc(getPublicCollection('users'), profile.id), { fotoProfil: base64Img }, { merge: true });
        setProfile({ ...profile, fotoProfil: base64Img });
        showToast('Foto profil berhasil diperbarui!', 'success');
      } catch (err) {
        showToast('Gagal memperbarui foto profil', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <GlobalBackground>
      <div className="md:hidden bg-white/95 backdrop-blur-md border-b border-slate-200 p-4 flex items-center justify-between z-20 sticky top-0 shadow-sm">
        <div className="flex items-center gap-2 font-bold text-xl text-orange-900">
          <div className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center text-sm">AL</div>Edu
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-600">{mobileMenuOpen ? <X /> : <Menu />}</button>
      </div>

      <div className="flex flex-1 overflow-hidden relative z-10 h-screen">
        <style>{`
          @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animated-sidebar {
            background: linear-gradient(-45deg, #fff7ed, #fffbeb, #fff, #fef3c7, #fff7ed);
            background-size: 400% 400%;
            animation: gradientShift 8s ease infinite;
          }
          .nav-item-active {
            background: linear-gradient(135deg, #ea580c, #f97316, #fb923c);
            background-size: 200% 200%;
            animation: gradientShift 3s ease infinite;
          }
        `}</style>
        <aside className={`animated-sidebar absolute md:static inset-y-0 left-0 border-r border-orange-100 w-64 transform transition-transform duration-300 z-30 flex flex-col ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 shadow-lg md:shadow-none`}>
          <div className="p-6 hidden md:flex items-center gap-2 font-bold text-2xl text-slate-800 border-b border-orange-100">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-amber-500 text-white flex items-center justify-center shadow-md">AL</div>Edu.
          </div>
          
          <div className="px-6 py-6 mt-4 md:mt-0 border-b border-slate-100 flex items-center gap-4">
            <label className="relative cursor-pointer group shrink-0" title="Ubah Foto Profil">
              <input type="file" className="hidden" accept="image/*" onChange={handleProfilePicUpload} />
              {profile?.fotoProfil ? (
                <img src={profile.fotoProfil} alt="profile" className="w-14 h-14 rounded-full object-cover border-2 border-orange-300 shadow-sm" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-orange-50 border-2 border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xl transition shadow-sm">
                  {profile?.nama?.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Overlay saat hover */}
              <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera size={16} className="text-white" />
              </div>
              {/* Badge edit selalu terlihat */}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                <Edit size={10} className="text-white" />
              </div>
            </label>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 line-clamp-1 text-sm">{profile?.nama}</p>
              <p className="text-xs text-orange-700 font-bold px-2 py-0.5 bg-orange-100 rounded-md inline-block mt-1">{profile?.role}</p>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {items.map((item) => (
              <button key={item.id} onClick={() => { setView(item.id); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${view === item.id ? 'nav-item-active text-white shadow-md' : 'text-slate-600 hover:text-white hover:shadow-md'}`}
                style={view !== item.id ? undefined : undefined}
                onMouseEnter={e => { if(view !== item.id) { e.currentTarget.style.background = 'linear-gradient(135deg, #f97316, #f59e0b)'; e.currentTarget.style.color = 'white'; } }}
                onMouseLeave={e => { if(view !== item.id) { e.currentTarget.style.background = ''; e.currentTarget.style.color = ''; } }}>
                <item.icon size={20} className="shrink-0" />{item.label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <button onClick={() => { setProfile(null); setView('landing'); }} className="w-full flex items-center gap-3 px-4 py-3 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors font-bold">
              <LogOut size={20} />Keluar
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-transparent">
          <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 sm:p-6 sticky top-0 z-10 hidden md:flex justify-between items-center shadow-sm">
            <h1 className="text-2xl font-bold text-slate-800 capitalize">{profile?.role} Portal</h1>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Cari..." className="pl-10 pr-4 py-2 bg-slate-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-64 border border-slate-200" />
              </div>
              <button className="p-2 text-slate-500 hover:text-orange-600 bg-slate-100 rounded-full transition-colors relative border border-slate-200">
                <Bell size={20} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
              </button>
            </div>
          </header>
          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </GlobalBackground>
  );
};

// --- SISWA COMPONENTS ---
const SiswaDashboard = () => {
  const { hasilKuis, setView, profile } = useContext(AppContext);
  const totalKuisSelesai = hasilKuis.length;
  const nilaiRataRata = totalKuisSelesai > 0 ? Math.round(hasilKuis.reduce((acc, curr) => acc + curr.nilai, 0) / totalKuisSelesai) : 0;
  const targetKuis = 5;
  const progressBelajar = Math.min(Math.round((totalKuisSelesai / targetKuis) * 100), 100);
  const estimasiWaktuJam = ((totalKuisSelesai * 15) / 60).toFixed(1);

  const chartData = hasilKuis.map((h, index) => ({ name: h.judulKuis ? (h.judulKuis.length > 12 ? h.judulKuis.slice(0, 10) + '..' : h.judulKuis) : `Kuis ${index + 1}`, nilai: h.nilai }));

  return (
    <div className="space-y-6">
      {/* Header sambutan */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-orange-100 text-sm font-medium">Selamat Datang 👋</p>
            <h2 className="text-2xl font-bold mt-1">{profile?.nama}</h2>
            <p className="text-orange-100 text-sm mt-1">Terus semangat belajar matematika!</p>
          </div>
          <div className="p-4 bg-white/20 rounded-2xl hidden sm:block">
            <Trophy size={36} className="text-white" />
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-orange-100 mb-1">
            <span>Progress Belajar</span>
            <span>{progressBelajar}%</span>
          </div>
          <div className="w-full bg-black/20 rounded-full h-3">
            <div className="bg-white h-3 rounded-full transition-all duration-700" style={{ width: `${progressBelajar}%` }}></div>
          </div>
          <p className="text-xs text-orange-100 mt-1">{totalKuisSelesai} dari {targetKuis} kuis target terselesaikan</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle size={28} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Kuis Selesai</p>
              <p className="text-2xl font-bold text-slate-800">{totalKuisSelesai}</p>
            </div>
          </div>
        </Card>
        <Card className="shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-orange-50 text-orange-600 rounded-xl"><Clock size={28} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Estimasi Belajar</p>
              <p className="text-2xl font-bold text-slate-800">{estimasiWaktuJam} Jam</p>
            </div>
          </div>
        </Card>
        <Card className="shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-xl"><BarChart3 size={28} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Nilai Rata-rata</p>
              <p className="text-2xl font-bold text-slate-800">{nilaiRataRata}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Statistik Nilai Kuis Riil</h3>
              <p className="text-xs text-slate-500 mt-1">Nilai rata-rata Anda saat ini: <span className="font-semibold text-orange-600">{nilaiRataRata}</span></p>
            </div>
          </div>
          <div className="h-64 flex flex-col justify-center">
            {totalKuisSelesai === 0 ? (
              <div className="text-center space-y-3 py-8">
                <HelpCircle size={40} className="mx-auto text-slate-300 animate-pulse" />
                <p className="text-sm text-slate-500">Belum ada statistik nilai. Selesaikan kuis pertama Anda.</p>
                <Button variant="secondary" onClick={() => setView('kuis')} className="text-xs">Mulai Kerjakan Kuis</Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="nilai" stroke="#f97316" strokeWidth={4} dot={{ r: 6, fill: '#f97316', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        
        <div className="space-y-6">
          <Card className="shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Lanjutkan Belajar</h3>
            <div className="space-y-4">
              <div onClick={() => setView('materi')} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-orange-50 cursor-pointer transition">
                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center"><PlayCircle /></div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-800 text-sm">Materi Tersedia</h4>
                  <p className="text-xs text-slate-500">Mulai membaca materi singkat</p>
                </div>
              </div>
              <div onClick={() => setView('bank_soal')} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-orange-50 cursor-pointer transition">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center"><Archive /></div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-800 text-sm">Bank Soal Baru</h4>
                  <p className="text-xs text-slate-500">Unduh referensi bank soal</p>
                </div>
              </div>
              <div onClick={() => setView('ai')} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-orange-50 cursor-pointer transition">
                <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center"><BrainCircuit /></div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-800 text-sm">Tanya AL-AI Tutor</h4>
                  <p className="text-xs text-slate-500">Asisten pemecah rumus 24/7</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const BankSoalGuru = () => {
  const { profile, showToast } = useContext(AppContext);
  const [bankSoal, setBankSoal] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const initialForm = { judul: '', deskripsi: '', fileData: '', fileName: '' };
  const [formData, setFormData] = useState(initialForm);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const q = query(getPublicCollection('bank_soal'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setBankSoal(snap.docs.map(d => ({id: d.id, ...d.data()}))));
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 700 * 1024) { showToast('Ukuran file maksimal 700 KB', 'error'); return; }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData({ ...formData, fileName: file.name, fileData: event.target.result });
      showToast('File berhasil disisipkan', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.fileData) { showToast('Harap lampirkan file dokumen bank soal!', 'error'); return; }
    try {
      await addDoc(getPublicCollection('bank_soal'), { ...formData, createdBy: profile.nama, createdAt: serverTimestamp() });
      showToast('Bank Soal berhasil dipublikasikan!', 'success');
      setIsAdding(false); setFormData(initialForm);
    } catch (err) { showToast('Gagal mempublikasikan Bank Soal', 'error'); }
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(getPublicCollection('bank_soal'), id));
      showToast('Bank Soal berhasil dihapus', 'success');
    } catch (e) { showToast('Gagal menghapus Bank Soal', 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Distribusi Bank Soal</h2>
          <p className="text-sm text-slate-500 mt-1">Unggah dokumen referensi soal (PDF/Docx) agar dapat diunduh siswa.</p>
        </div>
        <Button onClick={() => setIsAdding(!isAdding)} icon={isAdding ? X : Plus}>{isAdding ? 'Batal' : 'Unggah Bank Soal'}</Button>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" className="hidden" />

      {isAdding && (
        <Card className="border-orange-200 shadow-lg animate-fade-in-up">
          <form onSubmit={handleSave} className="space-y-4">
            <h3 className="font-bold text-lg text-slate-800 mb-2">Formulir Unggah Bank Soal</h3>
            <Input label="Judul Kumpulan Soal" placeholder="Misal: Bank Soal Vektor 2026" value={formData.judul} onChange={e => setFormData({...formData, judul: e.target.value})} required />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Deskripsi/Instruksi</label>
              <textarea className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 text-sm" value={formData.deskripsi} onChange={e => setFormData({...formData, deskripsi: e.target.value})} required rows="3" placeholder="Instruksi tambahan untuk siswa..."></textarea>
            </div>
            
            <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Archive className="text-orange-600" />
                <div>
                  <p className="text-sm font-bold text-slate-800">{formData.fileName || 'Belum ada dokumen yang dipilih'}</p>
                  <p className="text-xs text-slate-500">Maks. 700 KB. Dokumen ini akan bisa didownload siswa.</p>
                </div>
              </div>
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>Pilih File Dokumen</Button>
            </div>

            <div className="flex justify-end pt-4"><Button type="submit">Publikasikan ke Siswa</Button></div>
          </form>
        </Card>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {bankSoal.map(bs => (
          <Card key={bs.id} hover className="flex flex-col relative overflow-hidden group border-orange-100 bg-white/95">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
               <button onClick={() => handleDelete(bs.id)} className="p-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-500 hover:text-white transition"><Trash2 size={16}/></button>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 mb-4"><Archive /></div>
            <h3 className="font-bold text-lg text-slate-800 mb-1">{bs.judul}</h3>
            <p className="text-sm text-slate-500 mb-4 flex-1 line-clamp-3">{bs.deskripsi}</p>
            <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Oleh: {bs.createdBy}</span>
              <a href={bs.fileData} download={bs.fileName}><Button variant="secondary" className="px-3 py-1.5 text-xs text-orange-600"><Download size={14}/> Cek File</Button></a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const BankSoalSiswa = () => {
  const { showToast, logActivity } = useContext(AppContext);
  const [bankSoal, setBankSoal] = useState([]);

  useEffect(() => {
    const q = query(getPublicCollection('bank_soal'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setBankSoal(snap.docs.map(d => ({id: d.id, ...d.data()}))));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border-l-8 border-orange-500">
        <h2 className="text-2xl font-bold text-slate-800">Bank Soal Matematika</h2>
        <p className="text-sm text-slate-500 mt-1">Kumpulan referensi latihan soal lengkap yang diunggah oleh Guru Anda. Unduh untuk persiapan ujian yang lebih baik!</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {bankSoal.map(bs => (
          <Card key={bs.id} hover className="flex flex-col border-orange-100 bg-white/95">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-4"><FileText /></div>
            <h3 className="font-bold text-lg text-slate-800 mb-1">{bs.judul}</h3>
            <p className="text-sm text-slate-500 mb-4 flex-1">{bs.deskripsi}</p>
            <div className="mt-auto pt-4 border-t border-slate-100">
              <a href={bs.fileData} download={bs.fileName} onClick={() => {
                logActivity('Download Bank Soal', bs.judul);
                showToast('Bank Soal berhasil diunduh.', 'success');
              }}>
                <Button className="w-full text-sm" icon={Download}>Unduh Bank Soal</Button>
              </a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const BelajarView = () => {
  const { setView, setSelectedItem, materiList, materiLoading } = useContext(AppContext);
  if (materiLoading) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div></div>;
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800 bg-white p-6 rounded-2xl shadow-sm">Materi Pembelajaran</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {materiList.map(materi => (
          <Card hover key={materi.id} className="flex flex-col border-orange-100 shadow-md bg-white/95 backdrop-blur">
            <div className="h-40 bg-slate-100 rounded-xl mb-4 overflow-hidden relative group cursor-pointer">
              <div className="absolute inset-0 bg-orange-900/20 group-hover:bg-orange-900/40 transition flex items-center justify-center">
                <PlayCircle className="text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" size={48} />
              </div>
              <img src={`https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=400&q=80`} alt="cover" className="w-full h-full object-cover" />
            </div>
            <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded w-fit mb-2">{materi.kategori}</span>
            <h3 className="font-bold text-lg text-slate-900 mb-2 line-clamp-2">{materi.judul}</h3>
            <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">{materi.deskripsi}</p>
            <Button className="w-full shadow-md" onClick={() => { setSelectedItem(materi); setView('materi_detail'); }}>Mulai Belajar</Button>
          </Card>
        ))}
      </div>
    </div>
  );
};

const MateriDetail = () => {
  const { profile, selectedItem, setSelectedItem, setView, materiList, showToast, logActivity } = useContext(AppContext);
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const liveItem = materiList.find(m => m.id === selectedItem?.id);

  useEffect(() => {
    if (selectedItem && !liveItem && materiList.length > 0) {
      setView('materi'); setSelectedItem(null); showToast('Materi dihapus oleh Guru.', 'error');
    }
  }, [liveItem, materiList, selectedItem, setView, setSelectedItem, showToast]);

  useEffect(() => {
    if (!liveItem || profile?.role !== 'Siswa') return;
    let docId = null;
    const startSession = async () => {
      try {
        const ref = await addDoc(getPublicCollection('active_sessions'), { userId: profile.id, userName: profile.nama, type: 'Membaca Materi', itemName: liveItem.judul, startTime: serverTimestamp() });
        docId = ref.id; logActivity('Membaca', liveItem.judul);
      } catch (err) {}
    };
    startSession();
    return () => { if (docId) deleteDoc(doc(getPublicCollection('active_sessions'), docId)); };
  }, [liveItem, profile, logActivity]);

  if (!selectedItem) return null;
  const currentItem = liveItem || selectedItem;

  const handleSummarize = async () => {
    setIsSummarizing(true);
    try {
      const result = await callGeminiAPI(`Ringkas materi matematika berikut jadi bullet points:\n\n${currentItem.konten}`, "Guru matematika ahli", false);
      setSummary(result);
    } catch (error) { setSummary("Gagal membuat ringkasan saat ini."); } finally { setIsSummarizing(false); }
  };

  const renderMarkdown = (text) => {
    if (!text) return "Konten materi belum ditambahkan oleh Guru.";
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      let cleanLine = line.replace(/^[#]+\s*/, '').replace(/\*\*+/g, '').replace(/\*+/g, ''); 
      if (cleanLine.includes('![') || cleanLine.includes('](')) return null;
      if (cleanLine.trim() === '---') return <hr key={idx} className="my-8 border-slate-200" />;
      if (cleanLine.startsWith('- ')) return <li key={idx} className="ml-6 list-disc mb-2 text-slate-700">{cleanLine.substring(2)}</li>;
      if (cleanLine.trim() === '') return <br key={idx} />;
      return <p key={idx} className="mb-2 whitespace-pre-wrap text-slate-700 leading-relaxed">{cleanLine}</p>;
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in-up">
      <Button variant="secondary" onClick={() => setView('materi')} icon={ChevronLeft} className="border-orange-200">Kembali ke Daftar Materi</Button>
      <Card className="p-8 md:p-12 shadow-xl border border-orange-100 bg-white/95">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
          <div>
            <span className="text-sm font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full mb-4 inline-block">{currentItem.kategori}</span>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight">{currentItem.judul}</h1>
          </div>
          <Button onClick={handleSummarize} disabled={isSummarizing} icon={Sparkles} className="shrink-0 bg-orange-100 text-orange-700 hover:bg-orange-200 border-none shadow-none">{isSummarizing ? 'Merangkum...' : '✨ Ringkas Lebih Lanjut'}</Button>
        </div>

        {summary && (
          <div className="mb-8 p-6 bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-2xl relative">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles size={48} /></div>
            <h3 className="font-bold text-orange-900 mb-3 flex items-center gap-2"><Sparkles size={18} className="text-orange-600"/> Ringkasan AL-AI Tutor</h3>
            <div className="prose prose-sm prose-orange max-w-none text-slate-700 whitespace-pre-wrap">{summary}</div>
          </div>
        )}

        <p className="text-lg text-slate-500 mb-8 border-b border-orange-100 pb-8">{currentItem.deskripsi}</p>
        <div className="mb-6 flex items-center gap-2"><FileText className="text-orange-600" size={24} /><h2 className="text-xl font-bold text-slate-800">Poin-Poin Materi Singkat</h2></div>
        <div className="prose prose-orange max-w-none text-slate-700 mb-8 whitespace-pre-wrap leading-relaxed">{renderMarkdown(currentItem.konten)}</div>

        {currentItem.youtubeUrl && getYouTubeEmbedUrl(currentItem.youtubeUrl) && (
          <div className="mt-4 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🎥</span>
              <h3 className="text-lg font-bold text-slate-800">Video Pembelajaran</h3>
            </div>
            <div className="rounded-2xl overflow-hidden border border-orange-100 shadow-md w-full" style={{aspectRatio:'16/9'}}>
              <iframe
                src={getYouTubeEmbedUrl(currentItem.youtubeUrl)}
                className="w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                title={currentItem.judul}
              />
            </div>
          </div>
        )}

        {currentItem.dokumenData && currentItem.dokumenNama && (
          <div className="mt-4 mb-4 p-5 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                <FileText size={24} className="text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">{currentItem.dokumenNama}</p>
                <p className="text-xs text-slate-500 mt-0.5">Dokumen materi dari guru</p>
              </div>
            </div>
            <a 
              href={currentItem.dokumenData} 
              download={currentItem.dokumenNama}
              onClick={() => { logActivity('Download Dokumen', currentItem.judul); showToast('Dokumen didownload!', 'success'); }}
              className="shrink-0 w-full sm:w-auto"
            >
              <Button icon={Download} className="w-full sm:w-auto">Download Dokumen</Button>
            </a>
          </div>
        )}
      </Card>
    </div>
  );
};

const AITutor = () => {
  const { showToast } = useContext(AppContext);
  useEffect(() => {
    showToast('🔧 AL-AI Tutor sedang dalam proses pengembangan. Segera hadir!', 'info');
  }, []);
  return (
    <Card className="h-[70vh] flex flex-col items-center justify-center p-8 text-center border-2 border-orange-100 shadow-xl bg-white/95">
      <div className="w-24 h-24 bg-gradient-to-br from-orange-100 to-amber-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
        <BrainCircuit size={48} className="text-orange-400" />
      </div>
      <div className="space-y-3 max-w-md">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold border border-amber-200">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse inline-block"></span>
          Sedang Dalam Pengembangan
        </div>
        <h2 className="text-2xl font-bold text-slate-800">AL-AI Tutor</h2>
        <p className="text-slate-500 leading-relaxed text-sm">
          Fitur asisten AI khusus matematika sedang kami kembangkan. Segera hadir untuk membantu menjawab soal dan teori matematika!
        </p>
        <p className="text-xs text-slate-400">Gunakan fitur Materi, Kuis, dan Bank Soal sementara menunggu.</p>
      </div>
    </Card>
  );
};


const KelolaMateri = () => {
  const { profile, materiList, showToast } = useContext(AppContext);
  const [isAdding, setIsAdding] = useState(false);
  const initialForm = { id: '', judul: '', kategori: 'Polinomial', deskripsi: '', konten: '', youtubeUrl: '', dokumenNama: '', dokumenData: '' };
  const [formData, setFormData] = useState(initialForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    // Validasi URL YouTube jika diisi
    if (formData.youtubeUrl && !getYouTubeEmbedUrl(formData.youtubeUrl)) {
      showToast('Link YouTube tidak valid. Contoh: https://youtube.com/watch?v=xxx', 'error');
      return;
    }
    try {
      const dataToSave = { 
        judul: formData.judul, 
        kategori: formData.kategori, 
        deskripsi: formData.deskripsi, 
        konten: formData.konten,
        youtubeUrl: formData.youtubeUrl || '',
        dokumenNama: formData.dokumenNama || '',
        dokumenData: formData.dokumenData || '',
        updatedAt: serverTimestamp() 
      };
      if (formData.id) await setDoc(doc(getPublicCollection('materi'), formData.id), dataToSave, { merge: true });
      else await addDoc(getPublicCollection('materi'), { ...dataToSave, createdBy: profile.nama, createdAt: serverTimestamp() });
      showToast('✅ Materi berhasil disimpan!', 'success'); setIsAdding(false); setFormData(initialForm);
    } catch (err) { showToast('Gagal menyimpan materi.', 'error'); }
  };

  const handleEdit = (m) => {
    setFormData({ id: m.id, judul: m.judul, kategori: m.kategori || 'Polinomial', deskripsi: m.deskripsi, konten: m.konten, youtubeUrl: m.youtubeUrl || '', dokumenNama: m.dokumenNama || '', dokumenData: m.dokumenData || '' });
    setIsAdding(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const dokumenInputRef = useRef(null);
  const handleDokumenUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast('Ukuran dokumen maksimal 1 MB!', 'error'); return; }
    const allowedTypes = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    if (!allowedTypes.includes(file.type)) { showToast('Format tidak didukung. Gunakan PDF, DOC, DOCX, PPT, atau PPTX.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFormData(prev => ({ ...prev, dokumenNama: file.name, dokumenData: ev.target.result }));
      showToast(`✅ ${file.name} siap diupload`, 'success');
    };
    reader.readAsDataURL(file);
    if (dokumenInputRef.current) dokumenInputRef.current.value = '';
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 700 * 1024) { showToast('Maks 700 KB!', 'error'); return; }
    setIsScanning(true); showToast(`Menscan: ${file.name}...`, 'info');

    const isImage = file.type.startsWith('image/');
    const isText = file.type === 'text/plain';

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let resultStr;
        const schema = { type: "OBJECT", properties: { judul: { type: "STRING" }, kategori: { type: "STRING" }, deskripsi: { type: "STRING" }, konten: { type: "STRING" } }, required: ["judul", "kategori", "deskripsi", "konten"] };

        if (isImage) {
          // Kirim gambar langsung ke Gemini Vision
          resultStr = await callGeminiAPI(
            `Ekstrak materi matematika dari gambar ini menjadi draf ringkas. Tanpa # atau **.`,
            "Pembuat materi matematika profesional",
            true, schema,
            event.target.result, file.type
          );
        } else if (isText) {
          // Kirim isi teks langsung
          const textContent = event.target.result;
          resultStr = await callGeminiAPI(
            `Berikut isi dokumen "${file.name}":\n\n${textContent}\n\nEkstrak menjadi draf materi matematika singkat. Tanpa # atau **.`,
            "Pembuat materi matematika profesional",
            true, schema
          );
        } else {
          // PDF / DOCX: kirim sebagai dokumen base64 ke Gemini
          const base64Data = event.target.result;
          resultStr = await callGeminiAPI(
            `Ekstrak isi dokumen matematika ini menjadi draf materi singkat dan padat. Tanpa # atau **.`,
            "Pembuat materi matematika profesional",
            true, schema,
            base64Data, file.type === 'application/pdf' ? 'application/pdf' : 'application/octet-stream'
          );
        }

        const generatedData = parseGeminiJSON(resultStr);
        setFormData(prev => ({ ...prev, ...generatedData, fileName: file.name, fileData: event.target.result }));
        setIsAdding(true);
        showToast('✅ Scan selesai! Cek & simpan materi.', 'success');
      } catch (error) {
        console.error('Scan error:', error);
        showToast('Gagal scan dokumen. Coba file .txt atau gambar.', 'error');
      } finally {
        setIsScanning(false);
        // Reset input agar file yang sama bisa dipilih ulang
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    if (isText) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full p-6 space-y-4 shadow-xl border border-rose-100">
            <h3 className="text-lg font-bold text-slate-900">Hapus Materi?</h3>
            <p className="text-sm text-slate-500">Materi yang dihapus tidak bisa dikembalikan.</p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>Batal</Button>
              <Button variant="danger" onClick={async () => { await deleteDoc(doc(getPublicCollection('materi'), deleteConfirmId)); setDeleteConfirmId(null); showToast('Materi dihapus', 'success'); }}>Ya, Hapus</Button>
            </div>
          </Card>
        </div>
      )}

      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm">
        <div><h2 className="text-2xl font-bold text-slate-800">Manajemen Materi</h2><p className="text-sm text-slate-500">Kelola kurikulum dan materi pembelajaran.</p></div>
        <Button onClick={() => { setIsAdding(!isAdding); setFormData(initialForm); }} icon={isAdding ? X : Plus}>{isAdding ? 'Batal' : 'Tambah Materi'}</Button>
      </div>

      {isAdding && (
        <Card className="bg-orange-50/50 border-orange-100 shadow-md">
          <form onSubmit={handleSave} className="space-y-4">
            <h3 className="text-lg font-bold text-orange-950">{formData.id ? '✏️ Edit Materi' : '➕ Tambah Materi Baru'}</h3>
            <Input label="Judul Materi" placeholder="Contoh: Teorema Pythagoras" value={formData.judul} onChange={e => setFormData({...formData, judul: e.target.value})} required />
            <Input label="Deskripsi Singkat" placeholder="Contoh: Memahami hubungan sisi segitiga siku-siku" value={formData.deskripsi} onChange={e => setFormData({...formData, deskripsi: e.target.value})} required />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Konten Materi</label>
              <textarea 
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 h-48 text-sm leading-relaxed resize-none" 
                placeholder="Tulis isi materi di sini... Contoh: Teorema Pythagoras menyatakan bahwa a² + b² = c²"
                value={formData.konten} 
                onChange={e => setFormData({...formData, konten: e.target.value})} 
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">🎥 Link Video YouTube (opsional)</label>
              <input 
                type="url"
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 text-sm"
                placeholder="Contoh: https://youtube.com/watch?v=xxxxx"
                value={formData.youtubeUrl}
                onChange={e => setFormData({...formData, youtubeUrl: e.target.value})}
              />
              {formData.youtubeUrl && getYouTubeEmbedUrl(formData.youtubeUrl) && (
                <div className="mt-2 rounded-xl overflow-hidden border border-orange-200 aspect-video">
                  <iframe src={getYouTubeEmbedUrl(formData.youtubeUrl)} className="w-full h-full" allowFullScreen title="Preview video" />
                </div>
              )}
              {formData.youtubeUrl && !getYouTubeEmbedUrl(formData.youtubeUrl) && (
                <p className="text-xs text-rose-500 mt-1">⚠️ Link tidak valid. Gunakan link YouTube yang benar.</p>
              )}
            </div>
            {/* Upload Dokumen */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">📎 Upload Dokumen (opsional, maks 1 MB)</label>
              <input ref={dokumenInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={handleDokumenUpload} className="hidden" />
              {formData.dokumenNama ? (
                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <FileText size={20} className="text-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{formData.dokumenNama}</p>
                    <p className="text-xs text-slate-500">Dokumen siap disimpan</p>
                  </div>
                  <button type="button" onClick={() => setFormData(p => ({...p, dokumenNama: '', dokumenData: ''}))} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg shrink-0">
                    <X size={16}/>
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => dokumenInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-orange-400 hover:text-orange-500 hover:bg-orange-50 transition text-sm font-medium">
                  <Download size={18} className="rotate-180" />
                  Pilih file PDF, DOC, DOCX, PPT, atau PPTX
                </button>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => { setIsAdding(false); setFormData(initialForm); }}>Batal</Button>
              <Button type="submit">💾 Simpan Materi</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <tr><th className="p-4">Judul</th><th className="p-4 text-right">Aksi</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {materiList.length === 0 && <tr><td colSpan={2} className="p-8 text-center text-slate-400">Belum ada materi. Klik "Tambah Materi" untuk mulai.</td></tr>}
            {materiList.map(m => (
              <tr key={m.id} className="hover:bg-orange-50">
                <td className="p-4">
                  <p className="font-medium text-slate-900">{m.judul}</p>
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    {m.youtubeUrl && <span className="text-xs text-orange-500">🎥 Video</span>}
                    {m.dokumenNama && <span className="text-xs text-blue-500">📎 {m.dokumenNama}</span>}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => handleEdit(m)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={16}/></button>
                    <button onClick={() => setDeleteConfirmId(m.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={16}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const KelolaKuis = () => {
  const { showToast, profile } = useContext(AppContext);
  const [kuisList, setKuisList] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const initialForm = { id: '', judul: '', soalList: [] };
  const [formData, setFormData] = useState(initialForm);
  const [deleteKuisId, setDeleteKuisId] = useState(null);

  useEffect(() => {
    return onSnapshot(query(getPublicCollection('kuis')), (snap) => 
      setKuisList(snap.docs.map(d => ({id: d.id, ...d.data()})))
    );
  }, []);

  const handleSaveKuis = async (e) => {
    e.preventDefault();
    if (formData.soalList.length === 0) { showToast('Tambahkan minimal 1 soal!', 'error'); return; }
    try {
      if (formData.id) {
        await setDoc(doc(getPublicCollection('kuis'), formData.id), { judul: formData.judul, soalList: formData.soalList, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        await addDoc(getPublicCollection('kuis'), { judul: formData.judul, soalList: formData.soalList, createdBy: profile.nama, createdAt: serverTimestamp() });
      }
      showToast("✅ Kuis berhasil disimpan!", "success"); 
      setIsAdding(false); 
      setFormData(initialForm);
    } catch(e) { showToast("Gagal menyimpan kuis.", "error"); }
  };

  const tambahSoalBaru = () => {
    setFormData(p => ({
      ...p, 
      soalList: [...p.soalList, {
        pertanyaan: '', 
        opsi_a: '', opsi_b: '', opsi_c: '', opsi_d: '', 
        jawaban_benar: 'a', 
        pembahasan: ''
      }]
    }));
  };

  const updateSoal = (idx, field, value) => {
    const list = [...formData.soalList];
    list[idx] = {...list[idx], [field]: value};
    setFormData({...formData, soalList: list});
  };

  const hapusSoal = (idx) => {
    setFormData(p => ({...p, soalList: p.soalList.filter((_,i) => i !== idx)}));
  };

  return (
    <div className="space-y-6">
      {deleteKuisId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold">Hapus Kuis?</h3>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteKuisId(null)}>Batal</Button>
              <Button variant="danger" onClick={async () => { await deleteDoc(doc(getPublicCollection('kuis'), deleteKuisId)); setDeleteKuisId(null); showToast('Kuis dihapus', 'success'); }}>Ya, Hapus</Button>
            </div>
          </Card>
        </div>
      )}

      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Manajemen Kuis</h2>
          <p className="text-sm text-slate-500">Buat soal pilihan ganda untuk siswa.</p>
        </div>
        <Button onClick={() => { setIsAdding(!isAdding); setFormData(initialForm); }} icon={isAdding ? X : Plus}>
          {isAdding ? 'Tutup Editor' : 'Buat Kuis'}
        </Button>
      </div>

      {!isAdding ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><th className="p-4">Judul Kuis</th><th className="p-4 text-center">Soal</th><th className="p-4 text-right">Aksi</th></tr>
            </thead>
            <tbody>
              {kuisList.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-slate-400">Belum ada kuis. Klik "Buat Kuis" untuk mulai.</td></tr>}
              {kuisList.map(k => (
                <tr key={k.id} className="hover:bg-orange-50 border-b border-slate-100">
                  <td className="p-4 font-medium text-slate-900">{k.judul}</td>
                  <td className="p-4 text-center text-slate-500">{k.soalList?.length || 0} soal</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setFormData(k); setIsAdding(true); window.scrollTo(0,0); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={16}/></button>
                      <button onClick={() => setDeleteKuisId(k.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <form onSubmit={handleSaveKuis} className="space-y-6">
          {/* Header Kuis */}
          <Card className="border-t-4 border-t-orange-500 shadow-md">
            <h3 className="text-base font-bold text-slate-700 mb-3">📋 Informasi Kuis</h3>
            <Input 
              label="Judul Kuis" 
              placeholder="Contoh: Kuis Bab 3 - Teorema Pythagoras"
              value={formData.judul} 
              onChange={e => setFormData({...formData, judul: e.target.value})} 
              required 
            />
          </Card>

          {/* Daftar Soal */}
          <div className="space-y-4">
            {formData.soalList.length === 0 && (
              <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-300">
                <p className="text-slate-400 mb-3">Belum ada soal</p>
                <Button type="button" onClick={tambahSoalBaru} icon={Plus}>Tambah Soal Pertama</Button>
              </div>
            )}
            {formData.soalList.map((soal, idx) => (
              <Card key={idx} className="border border-orange-100 shadow-sm">
                {/* Nomor & hapus soal */}
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">Soal {idx + 1}</span>
                  <button type="button" onClick={() => hapusSoal(idx)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg">
                    <Trash2 size={16}/>
                  </button>
                </div>

                {/* Pertanyaan */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">PERTANYAAN</label>
                  <textarea 
                    value={soal.pertanyaan} 
                    onChange={e => updateSoal(idx, 'pertanyaan', e.target.value)} 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none" 
                    rows={2}
                    placeholder="Tulis pertanyaan di sini..."
                    required
                  />
                </div>

                {/* Pilihan Jawaban A B C D */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-500 mb-2">PILIHAN JAWABAN <span className="text-orange-500">(pilih radio = jawaban benar)</span></label>
                  <div className="space-y-2">
                    {['a','b','c','d'].map(opt => (
                      <div key={opt} className={`flex items-center gap-3 p-3 rounded-xl border transition ${soal.jawaban_benar === opt ? 'bg-orange-50 border-orange-400' : 'bg-white border-slate-200'}`}>
                        <input 
                          type="radio" 
                          name={`jawaban_${idx}`}
                          checked={soal.jawaban_benar === opt} 
                          onChange={() => updateSoal(idx, 'jawaban_benar', opt)}
                          className="accent-orange-500 w-4 h-4 shrink-0"
                        />
                        <span className={`text-sm font-bold w-6 shrink-0 ${soal.jawaban_benar === opt ? 'text-orange-600' : 'text-slate-400'}`}>{opt.toUpperCase()}.</span>
                        <input 
                          type="text" 
                          value={soal[`opsi_${opt}`]} 
                          onChange={e => updateSoal(idx, `opsi_${opt}`, e.target.value)} 
                          className="flex-1 bg-transparent outline-none text-sm"
                          placeholder={`Opsi ${opt.toUpperCase()}...`}
                          required
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pembahasan */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">PEMBAHASAN (ditampilkan setelah siswa menjawab)</label>
                  <textarea 
                    placeholder="Jelaskan mengapa jawaban tersebut benar..." 
                    value={soal.pembahasan} 
                    onChange={e => updateSoal(idx, 'pembahasan', e.target.value)} 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none" 
                    rows={2}
                    required
                  />
                </div>
              </Card>
            ))}
          </div>

          {/* Tombol aksi */}
          <div className="flex gap-3 p-4 bg-white rounded-xl shadow-sm border border-slate-200">
            <Button type="button" variant="secondary" onClick={tambahSoalBaru} icon={Plus} className="flex-1">Tambah Soal</Button>
            <Button type="submit" className="flex-1">💾 Simpan Kuis</Button>
          </div>
        </form>
      )}
    </div>
  );
};

const SiswaKuisView = () => {
  const { profile, showToast, logActivity } = useContext(AppContext);
  const [kuisList, setKuisList] = useState([]);
  const [activeKuis, setActiveKuis] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    return onSnapshot(query(getPublicCollection('kuis')), (snap) => { setKuisList(snap.docs.map(d => ({ id: d.id, ...d.data() }))); });
  }, []);

  const handleSubmitKuis = async () => {
    let correctCount = 0;
    activeKuis.soalList.forEach((soal, idx) => { if (answers[idx] === soal.jawaban_benar.toLowerCase()) correctCount++; });
    const finalScore = Math.round((correctCount / activeKuis.soalList.length) * 100);
    setScore(finalScore); setSubmitted(true);
    await addDoc(getUserCollection(profile.id, 'hasil_kuis'), { kuisId: activeKuis.id, judulKuis: activeKuis.judul, nilai: finalScore, timestamp: serverTimestamp() });
    logActivity('Mengerjakan Kuis', activeKuis.judul);
    showToast("Hasil kuis berhasil direkam di dasbor.", "success");
  };

  if (activeKuis) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto"><Button variant="secondary" onClick={() => setActiveKuis(null)}>Kembali</Button>
        <Card className="p-8 shadow-xl bg-white/95"><h3 className="text-2xl font-extrabold text-slate-900 mb-6">{activeKuis.judul}</h3>
          <div className="space-y-8">
            {activeKuis.soalList.map((soal, sIdx) => (
              <div key={sIdx} className="space-y-3"><p className="font-semibold text-lg">{sIdx + 1}. {soal.pertanyaan}</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {['a','b','c','d'].map(opt => (
                    <button key={opt} onClick={() => { if (!submitted) setAnswers(p => ({ ...p, [sIdx]: opt })); }} className={`p-4 rounded-xl border text-left ${submitted ? (soal.jawaban_benar===opt ? "bg-emerald-50 border-emerald-300" : (answers[sIdx]===opt ? "bg-rose-50" : "bg-slate-50 opacity-60")) : (answers[sIdx]===opt ? "border-orange-600 bg-orange-50 ring-2 ring-orange-600/10" : "bg-white")}`} disabled={submitted}><span className="uppercase font-bold mr-2 text-slate-400">{opt}.</span>{soal[`opsi_${opt}`]}</button>
                  ))}
                </div>
                {submitted && <div className="bg-orange-50 p-4 rounded-xl border border-orange-100"><p className="text-xs font-bold text-orange-700 mb-1">Pembahasan:</p><p className="text-sm">{soal.pembahasan}</p></div>}
              </div>
            ))}
          </div>
          {!submitted ? <div className="mt-8 pt-8 border-t flex justify-end"><Button onClick={handleSubmitKuis}>Kirim Jawaban</Button></div> : <div className="mt-8 pt-8 border-t text-center"><div className="text-3xl font-extrabold text-orange-600 mb-4">Skor: {score}</div><Button onClick={() => setActiveKuis(null)} variant="secondary">Selesai</Button></div>}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6"><h2 className="text-2xl font-bold bg-white p-6 rounded-2xl shadow-sm">Kuis Interaktif</h2>
      <div className="grid md:grid-cols-2 gap-6">
        {kuisList.map(kuis => (
          <Card hover key={kuis.id} className="flex flex-col border-orange-100 shadow-md bg-white/95">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 mb-4"><Trophy /></div>
            <h3 className="font-bold text-lg mb-4">{kuis.judul}</h3><Button className="w-full mt-auto" onClick={() => {setActiveKuis(kuis); setAnswers({}); setSubmitted(false)}}>Mulai Kuis</Button>
          </Card>
        ))}
      </div>
    </div>
  );
};

const ProgressSiswa = () => {
  const [activeSessions, setActiveSessions] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);

  useEffect(() => {
    const unsub1 = onSnapshot(query(getPublicCollection('active_sessions')), (snap) => setActiveSessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsub2 = onSnapshot(query(getPublicCollection('activities'), orderBy('timestamp', 'desc'), limit(50)), (snap) => setActivityLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsub1(); unsub2(); };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-orange-200 shadow-md bg-white/95">
          <div className="flex items-center gap-2 mb-4"><span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span><h3 className="text-lg font-bold text-slate-800">Siswa Aktif (Live)</h3></div>
          <div className="space-y-3">
            {activeSessions.length === 0 ? <p className="text-sm text-slate-500 py-4 text-center">Tidak ada siswa aktif</p> : activeSessions.map((session) => (
              <div key={session.id} className="p-3 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-between"><div><p className="font-bold text-sm">{session.userName}</p><p className="text-xs text-orange-700 truncate max-w-[150px]">{session.type}</p></div><Activity size={16} className="text-emerald-500 animate-pulse"/></div>
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-2 shadow-md bg-white/95">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Log Riwayat Aktivitas Terbaru</h3>
          <div className="overflow-auto max-h-64"><table className="w-full text-left text-sm"><thead className="bg-slate-50 sticky top-0"><tr><th className="p-3">Siswa</th><th className="p-3">Aktivitas</th><th className="p-3">Materi</th></tr></thead><tbody className="divide-y divide-slate-100">
            {activityLogs.map(log => (<tr key={log.id}>
              <td className="p-3 font-semibold">{log.userName}</td>
              <td className="p-3"><span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">{log.type}</span></td>
              <td className="p-3 text-slate-600">{log.itemName}</td>
            </tr>))}
          </tbody></table></div>
        </Card>
      </div>
    </div>
  );
};

const GuruDashboard = () => {
  const { profile, materiList } = useContext(AppContext);
  const [kuisCount, setKuisCount] = useState(0);
  const [userCount, setUserCount] = useState(0);

  useEffect(() => {
    const u1 = onSnapshot(query(getPublicCollection('kuis')), snap => setKuisCount(snap.size));
    const u2 = onSnapshot(query(getPublicCollection('users')), snap => setUserCount(snap.docs.filter(d => d.data().role === 'Siswa').length));
    return () => { u1(); u2(); };
  }, []);

  return (
    <div className="space-y-6">
      {/* Ringkasan statistik */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="shadow-sm bg-gradient-to-br from-orange-500 to-amber-500 text-white border-none">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-orange-100 text-sm font-medium">Total Materi</p>
              <p className="text-4xl font-bold mt-1">{materiList.length}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><BookOpen size={22}/></div>
          </div>
        </Card>
        <Card className="shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><FileText size={22}/></div>
            <div>
              <p className="text-sm text-slate-500">Total Kuis</p>
              <p className="text-2xl font-bold text-slate-800">{kuisCount}</p>
            </div>
          </div>
        </Card>
        <Card className="shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Users size={22}/></div>
            <div>
              <p className="text-sm text-slate-500">Total Siswa</p>
              <p className="text-2xl font-bold text-slate-800">{userCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Progress siswa langsung di dashboard */}
      <ProgressSiswa />
    </div>
  );
};

const AdminBackground = () => {
  const { showToast } = useContext(AppContext);
  const [current, setCurrent] = useState(() => {
    try { return localStorage.getItem('al_edu_bg') || 'default'; } catch(e) { return 'default'; }
  });

  const handleSelect = (value) => {
    setCurrent(value);
    try { localStorage.setItem('al_edu_bg', value); } catch(e) {}
    showToast('✅ Background berhasil diubah! Refresh halaman untuk melihat perubahan.', 'success');
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <h2 className="text-2xl font-bold text-slate-800 mb-1">🎨 Atur Tampilan Background</h2>
        <p className="text-slate-500 text-sm mb-6">Pilih tema background yang akan ditampilkan di seluruh halaman website.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {BG_PRESETS.map(preset => (
            <button
              key={preset.value}
              onClick={() => handleSelect(preset.value)}
              className={`relative rounded-2xl overflow-hidden border-4 transition-all duration-200 ${current === preset.value ? 'border-orange-500 shadow-xl scale-105' : 'border-slate-200 hover:border-orange-300'}`}
            >
              {/* Preview background */}
              <div 
                className="h-24 w-full"
                style={preset.style.startsWith('url(') 
                  ? { backgroundImage: preset.style, backgroundSize: 'cover', backgroundPosition: 'center' } 
                  : { background: preset.style }
                }
              />
              <div className="p-2 bg-white text-center">
                <span className="text-xs font-bold text-slate-700">{preset.label}</span>
              </div>
              {current === preset.value && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center shadow-md">
                  <CheckCircle size={14} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs text-amber-700 font-medium">⚠️ Setelah memilih tema, klik tombol refresh browser (F5) agar perubahan terlihat di semua halaman.</p>
        </div>
      </Card>
    </div>
  );
};

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  useEffect(() => { return onSnapshot(query(getPublicCollection('users')), (snap) => setUsers(snap.docs.map(d => ({id: d.id, ...d.data()})))); }, []);
  return (
    <Card className="shadow-lg bg-white/95"><h2 className="text-2xl font-bold mb-6">Manajemen Pengguna</h2><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-4">Nama</th><th className="p-4">Email</th><th className="p-4">Role</th><th className="p-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">
      {users.map(u => (<tr key={u.id} className="hover:bg-slate-50"><td className="p-4 font-semibold">{u.nama}</td><td className="p-4 text-slate-600">{u.email}</td><td className="p-4 font-bold text-orange-600">{u.role}</td><td className="p-4 text-right"><button onClick={() => deleteDoc(doc(getPublicCollection('users'), u.id))} className="text-rose-600 p-2"><Trash2 size={16}/></button></td></tr>))}
    </tbody></table></Card>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('landing'); 
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [materiList, setMateriList] = useState([]);
  const [materiLoading, setMateriLoading] = useState(true);
  const [hasilKuis, setHasilKuis] = useState([]);
  const [bgStyle, setBgStyle] = useState('default');

  const showToast = (msg, type = 'info') => setToast({ msg, type });

  const logActivity = async (type, itemName) => {
    if (!profile || profile.role !== 'Siswa') return;
    try { await addDoc(getPublicCollection('activities'), { userId: profile.id, userName: profile.nama, type: type, itemName: itemName, timestamp: serverTimestamp() }); } catch (e) {}
  };

  useEffect(() => {
    const initAuth = async () => { try { if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) { await signInWithCustomToken(auth, __initial_auth_token); } else { await signInAnonymously(auth); } } catch (err) {} };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => { setUser(authUser); setLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubM = onSnapshot(query(getPublicCollection('materi')), (snap) => { setMateriList(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setMateriLoading(false); }, () => setMateriLoading(false));
    return () => unsubM();
  }, [user]);

  useEffect(() => {
    if (!user || !profile || profile.role !== 'Siswa') { setHasilKuis([]); return; }
    const unsubH = onSnapshot(query(getUserCollection(profile.id, 'hasil_kuis')), (snap) => { setHasilKuis(snap.docs.map(d => ({ id: d.id, ...d.data() }))); });
    return () => unsubH();
  }, [user, profile]);

  if (loading) return <div className="min-h-screen bg-orange-50"></div>;

  const renderContent = () => {
    if (view === 'landing') return <LandingPage onStart={() => setView('auth')} />;
    if (view === 'auth') return <AuthPortal onLoginSuccess={(u) => { setProfile(u); setView('dashboard'); }} />;
    if (!profile) return <LandingPage onStart={() => setView('auth')} />; 

    return (
      <Layout>
        {profile.role === 'Siswa' && (
          <>
            {view === 'dashboard' && <SiswaDashboard />}
            {view === 'materi' && <BelajarView />}
            {view === 'materi_detail' && <MateriDetail />}
            {view === 'ai' && <AITutor />}
            {view === 'kuis' && <SiswaKuisView />}
            {view === 'bank_soal' && <BankSoalSiswa />}
          </>
        )}
        {profile.role === 'Guru' && (
          <>
            {view === 'dashboard' && <GuruDashboard />}
            {view === 'materi' && <KelolaMateri />}
            {view === 'kuis' && <KelolaKuis />}
            {view === 'bank_soal' && <BankSoalGuru />}
            {view === 'siswa' && <ProgressSiswa />}
          </>
        )}
        {profile.role === 'Admin' && (
          <>
            {view === 'dashboard' && <Card className="shadow-lg bg-white/95"><h2 className="text-2xl font-bold">Sistem Overview</h2><p className="text-slate-500 mt-2">Selamat datang Admin. Anda dapat memantau seluruh pengguna sistem AL Edu secara real-time.</p></Card>}
            {view === 'users' && <AdminUsers />}
            {view === 'tampilan' && <AdminBackground />}
          </>
        )}
      </Layout>
    );
  };

  return (
    <AppContext.Provider value={{ user, profile, view, setView, setProfile, selectedItem, setSelectedItem, toast, setToast, showToast, logActivity, materiList, materiLoading, hasilKuis }}>
      {renderContent()}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </AppContext.Provider>
  );
};

export default App;
