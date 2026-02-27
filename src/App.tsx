// Version: 1.0.2 - Force sync and visible update badge
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Users, 
  Calendar, 
  ChevronRight, 
  Trash2, 
  ArrowLeft, 
  Calculator, 
  ClipboardList,
  ChevronDown,
  ChevronUp,
  UserPlus,
  DollarSign,
  Info,
  Settings,
  Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RosterItem, Period, BonusEntry, View } from './types';
import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  deleteDoc, 
  updateDoc, 
  query, 
  orderBy, 
  getDoc,
  where,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';

export default function App() {
  const [view, setView] = useState<View>('periods');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [entries, setEntries] = useState<BonusEntry[]>([]);
  const [activePeriod, setActivePeriod] = useState<Period | null>(null);
  const [periodTab, setPeriodTab] = useState<'settlement' | 'details'>('settlement');
  
  // Form States
  const [newRosterName, setNewRosterName] = useState('');
  const [newRosterEligible, setNewRosterEligible] = useState(true);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newEntry, setNewEntry] = useState({
    vendor: '',
    unit_price: '',
    person_quantities: {} as Record<string, string>
  });
  const [actualBonusInput, setActualBonusInput] = useState('');

  // UI States
  const [isAddingRoster, setIsAddingRoster] = useState(false);
  const [isAddingPeriod, setIsAddingPeriod] = useState(false);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [isConfigMissing, setIsConfigMissing] = useState(false);

  useEffect(() => {
    // Check if Firebase config is provided
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setIsConfigMissing(true);
      return;
    }

    // Real-time listeners
    const qRoster = query(collection(db, 'roster'), orderBy('name', 'asc'));
    const unsubscribeRoster = onSnapshot(qRoster, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setRoster(data);
    });

    const qPeriods = query(collection(db, 'periods'), orderBy('created_at', 'desc'));
    const unsubscribePeriods = onSnapshot(qPeriods, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        created_at: doc.data().created_at?.toDate()?.toISOString() || new Date().toISOString()
      } as any));
      setPeriods(data);
    });

    return () => {
      unsubscribeRoster();
      unsubscribePeriods();
    };
  }, []);

  useEffect(() => {
    if (selectedPeriodId) {
      // Period details listener
      const unsubscribePeriod = onSnapshot(doc(db, 'periods', selectedPeriodId), (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as any;
          setActivePeriod(data);
          setActualBonusInput(data.actual_total_bonus?.toString() || '0');
        }
      });

      const qEntries = query(collection(db, 'bonus_entries'), where('period_id', '==', selectedPeriodId));
      const unsubscribeEntries = onSnapshot(qEntries, (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const entryData = docSnap.data();
          const person = roster.find(r => r.id.toString() === entryData.person_id.toString());
          return { 
            id: docSnap.id, 
            ...entryData,
            person_name: person ? person.name : '未知人員'
          } as any;
        });
        setEntries(data);
      });

      return () => {
        unsubscribePeriod();
        unsubscribeEntries();
      };
    }
  }, [selectedPeriodId, roster]);

  const handleAddRoster = async () => {
    if (!newRosterName) return;
    await addDoc(collection(db, 'roster'), {
      name: newRosterName,
      is_eligible_default: newRosterEligible ? 1 : 0
    });
    setNewRosterName('');
    setIsAddingRoster(false);
  };

  const handleDeleteRoster = async (id: string) => {
    if (!confirm('確定要刪除此人員嗎？')) return;
    await deleteDoc(doc(db, 'roster', id));
  };

  const handleAddPeriod = async () => {
    if (!newPeriodName) return;
    const docRef = await addDoc(collection(db, 'periods'), {
      name: newPeriodName,
      actual_total_bonus: 0,
      created_at: Timestamp.now()
    });
    setNewPeriodName('');
    setIsAddingPeriod(false);
    handleViewPeriod(docRef.id);
  };

  const handleDeletePeriod = async (id: string) => {
    if (!confirm('確定要刪除此檔期嗎？')) return;
    // Delete entries first
    const q = query(collection(db, 'bonus_entries'), where('period_id', '==', id));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'bonus_entries', d.id)));
    await Promise.all(deletePromises);
    await deleteDoc(doc(db, 'periods', id));
    setView('periods');
  };

  const handleViewPeriod = (id: string) => {
    setSelectedPeriodId(id);
    setView('period_detail');
    setPeriodTab('settlement');
  };

  const handleAddEntry = async () => {
    if (!newEntry.vendor || !newEntry.unit_price || !selectedPeriodId) return;
    
    const unitPrice = parseFloat(newEntry.unit_price) || 0;

    if (editingEntryId) {
      // Editing single entry
      const personId = Object.keys(newEntry.person_quantities)[0];
      if (!personId) return;
      const qty = parseInt(newEntry.person_quantities[personId]) || 0;
      const person = roster.find(r => r.id === personId);
      
      const entryData = {
        period_id: selectedPeriodId,
        person_id: personId,
        person_name: person?.name || '未知',
        vendor: newEntry.vendor,
        unit_price: unitPrice,
        quantity: qty,
        is_eligible: person ? person.is_eligible_default : 1
      };
      await updateDoc(doc(db, 'bonus_entries', editingEntryId), entryData);
    } else {
      // Adding multiple entries
      const batchPromises = Object.entries(newEntry.person_quantities)
        .filter(([_, qtyStr]) => parseInt(qtyStr as string) > 0)
        .map(([personId, qtyStr]) => {
          const person = roster.find(r => r.id === personId);
          return addDoc(collection(db, 'bonus_entries'), {
            period_id: selectedPeriodId,
            person_id: personId,
            person_name: person?.name || '未知',
            vendor: newEntry.vendor,
            unit_price: unitPrice,
            quantity: parseInt(qtyStr as string),
            is_eligible: person ? person.is_eligible_default : 1
          });
        });
      await Promise.all(batchPromises);
    }

    setNewEntry({ vendor: '', unit_price: '', person_quantities: {} });
    setIsAddingEntry(false);
    setEditingEntryId(null);
  };

  const handleEditEntry = (entry: BonusEntry) => {
    setNewEntry({
      vendor: entry.vendor,
      unit_price: entry.unit_price.toString(),
      person_quantities: { [entry.person_id]: entry.quantity.toString() }
    });
    setEditingEntryId(entry.id);
    setIsAddingEntry(true);
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('確定要刪除此筆登記嗎？')) return;
    await deleteDoc(doc(db, 'bonus_entries', id));
  };

  const handleUpdateActualBonus = async () => {
    if (!selectedPeriodId) return;
    await updateDoc(doc(db, 'periods', selectedPeriodId), {
      actual_total_bonus: parseFloat(actualBonusInput) || 0
    });
  };

  // Calculations
  const calculations = useMemo(() => {
    const totalRegistered = entries.reduce((sum, e) => sum + (e.unit_price * e.quantity), 0);
    const actualTotal = activePeriod?.actual_total_bonus || 0;
    const surplus = Math.max(0, actualTotal - totalRegistered);

    const personMap = new Map<string, { 
      name: string, 
      registered: number, 
      isEligible: boolean, 
      entries: BonusEntry[] 
    }>();

    entries.forEach(e => {
      const pId = e.person_id.toString();
      if (!personMap.has(pId)) {
        personMap.set(pId, { 
          name: e.person_name, 
          registered: 0, 
          isEligible: e.is_eligible === 1, 
          entries: [] 
        });
      }
      const p = personMap.get(pId)!;
      p.registered += (e.unit_price * e.quantity);
      p.entries.push(e);
      p.isEligible = e.is_eligible === 1; 
    });

    const eligiblePeopleCount = Array.from(personMap.values()).filter(p => p.isEligible).length;
    const surplusPerPerson = eligiblePeopleCount > 0 ? surplus / eligiblePeopleCount : 0;

    const settlement = Array.from(personMap.entries()).map(([id, p]) => ({
      id,
      name: p.name,
      registered: p.registered,
      surplus: p.isEligible ? surplusPerPerson : 0,
      total: p.registered + (p.isEligible ? surplusPerPerson : 0),
      isEligible: p.isEligible,
      entries: p.entries
    }));

    // Group by Vendor for Details view
    const vendorMap = new Map<string, { registered: number, entries: BonusEntry[] }>();
    entries.forEach(e => {
      if (!vendorMap.has(e.vendor)) {
        vendorMap.set(e.vendor, { registered: 0, entries: [] });
      }
      const v = vendorMap.get(e.vendor)!;
      v.registered += (e.unit_price * e.quantity);
      v.entries.push(e);
    });

    const vendorDetails = Array.from(vendorMap.entries()).map(([name, v]) => ({
      name,
      registered: v.registered,
      entries: v.entries
    }));

    return { totalRegistered, actualTotal, surplus, settlement, vendorDetails };
  }, [entries, activePeriod]);

  const handleQuantityChange = (personId: string, qty: string) => {
    setNewEntry(prev => ({
      ...prev,
      person_quantities: {
        ...prev.person_quantities,
        [personId]: qty
      }
    }));
  };

  const uniqueVendors = useMemo(() => {
    const vendors = new Set<string>();
    periods.forEach(p => {
      // This would ideally come from a global entries list, 
      // but we can at least use current entries or a separate collection
    });
    // For now, get from current entries across all periods if available
    entries.forEach(e => vendors.add(e.vendor));
    return Array.from(vendors);
  }, [entries]);

  if (isConfigMissing) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center p-10 text-center">
        <Settings size={64} className="text-jp-muted mb-6 animate-spin-slow" />
        <h2 className="text-2xl font-display font-bold mb-4">需要 Firebase 設定</h2>
        <p className="text-jp-muted mb-8">請在環境變數中設定 Firebase API 金鑰與專案 ID 以開始使用資料庫功能。</p>
        <div className="bg-jp-border/20 p-4 rounded-xl text-left text-xs font-mono w-full">
          <p>VITE_FIREBASE_API_KEY=...</p>
          <p>VITE_FIREBASE_PROJECT_ID=...</p>
          <p>...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col pb-20">
      {/* Header */}
      <header className="p-6 pt-10 flex items-center justify-between">
        {view === 'period_detail' ? (
          <button onClick={() => setView('periods')} className="p-2 -ml-2 text-jp-ink">
            <ArrowLeft size={24} />
          </button>
        ) : (
          <h1 className="text-2xl font-display font-bold text-jp-ink">
            {view === 'periods' ? '獎金檔期' : '名冊管理'}
          </h1>
        )}
        
        {view === 'periods' && (
          <button 
            onClick={() => setIsAddingPeriod(true)}
            className="w-10 h-10 rounded-full bg-jp-accent text-white flex items-center justify-center shadow-sm"
          >
            <Plus size={24} />
          </button>
        )}
        {view === 'roster' && (
          <button 
            onClick={() => setIsAddingRoster(true)}
            className="w-10 h-10 rounded-full bg-jp-accent text-white flex items-center justify-center shadow-sm"
          >
            <UserPlus size={20} />
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6">
        <AnimatePresence mode="wait">
          {view === 'periods' && (
            <motion.div 
              key="periods"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {periods.length === 0 ? (
                <div className="text-center py-20 text-jp-muted">
                  <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                  <p>尚無檔期，點擊上方 + 開始</p>
                </div>
              ) : (
                periods.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => handleViewPeriod(p.id)}
                    className="glass-card p-5 rounded-2xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <div>
                      <h3 className="font-medium text-lg">{p.name}</h3>
                      <p className="text-xs text-jp-muted mt-1">
                        {new Date(p.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-jp-muted">實際獎金</p>
                        <p className="font-display font-bold text-jp-accent">
                          ${(p.actual_total_bonus || 0).toLocaleString()}
                        </p>
                      </div>
                      <ChevronRight size={20} className="text-jp-border" />
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {view === 'roster' && (
            <motion.div 
              key="roster"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {roster.length === 0 ? (
                <div className="text-center py-20 text-jp-muted">
                  <Users size={48} className="mx-auto mb-4 opacity-20" />
                  <p>尚無名冊，請先新增人員</p>
                </div>
              ) : (
                roster.map(r => (
                  <div key={r.id} className="glass-card p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${r.is_eligible_default ? 'bg-jp-accent' : 'bg-jp-secondary'}`} />
                      <div>
                        <p className="font-medium">{r.name}</p>
                        <p className="text-[10px] uppercase tracking-wider text-jp-muted">
                          {r.is_eligible_default ? '預設可平分' : '預設支援'}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteRoster(r.id.toString())}
                      className="p-2 text-jp-secondary opacity-50 hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {view === 'period_detail' && activePeriod && (
            <motion.div 
              key="period_detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-display font-bold">{activePeriod.name}</h2>
                <button 
                  onClick={() => handleDeletePeriod(activePeriod.id)}
                  className="text-jp-secondary flex items-center gap-1 text-sm"
                >
                  <Trash2 size={16} /> 刪除檔期
                </button>
              </div>

              {/* Summary Card */}
              <div className="bg-jp-accent/10 p-6 rounded-3xl border border-jp-accent/20">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-jp-accent font-bold uppercase tracking-widest block mb-1">實際總獎金</label>
                    <div className="flex items-center gap-2">
                      <span className="text-jp-accent font-bold">$</span>
                      <input 
                        type="number" 
                        value={actualBonusInput}
                        onChange={(e) => setActualBonusInput(e.target.value)}
                        onBlur={handleUpdateActualBonus}
                        className="bg-transparent border-b border-jp-accent/30 focus:border-jp-accent outline-none font-display font-bold text-xl w-full"
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <label className="text-[10px] text-jp-muted font-bold uppercase tracking-widest block mb-1">登記總額</label>
                    <p className="font-display font-bold text-xl text-jp-ink">
                      ${calculations.totalRegistered.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-jp-accent/10 flex justify-between items-center">
                  <span className="text-sm text-jp-accent/80">剩餘可平分金額</span>
                  <span className="font-display font-bold text-lg text-jp-accent">
                    ${calculations.surplus.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex p-1 bg-jp-border/30 rounded-xl">
                <button 
                  onClick={() => setPeriodTab('settlement')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${periodTab === 'settlement' ? 'bg-white shadow-sm text-jp-ink' : 'text-jp-muted'}`}
                >
                  分配結算
                </button>
                <button 
                  onClick={() => setPeriodTab('details')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${periodTab === 'details' ? 'bg-white shadow-sm text-jp-ink' : 'text-jp-muted'}`}
                >
                  詳細登記
                </button>
              </div>

              {/* Tab Content */}
              <div className="pb-10">
                {periodTab === 'settlement' ? (
                  <div className="space-y-3">
                    {calculations.settlement.length === 0 ? (
                      <div className="text-center py-10 text-jp-muted">
                        <Info size={32} className="mx-auto mb-2 opacity-20" />
                        <p>尚無登記資料</p>
                      </div>
                    ) : (
                      calculations.settlement.map(s => (
                        <div key={s.id} className="glass-card p-4 rounded-2xl">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-bold flex items-center gap-2">
                                {s.name}
                                {!s.isEligible && (
                                  <span className="text-[9px] bg-jp-secondary/10 text-jp-secondary px-1.5 py-0.5 rounded border border-jp-secondary/20">支援</span>
                                )}
                              </h4>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-jp-muted">應領總額</p>
                              <p className="font-display font-bold text-jp-accent text-lg">
                                ${s.total.toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-between text-[11px] text-jp-muted">
                            <span>登記: ${s.registered.toLocaleString()}</span>
                            {s.isEligible && (
                              <span className="text-jp-accent">平分: +${s.surplus.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button 
                      onClick={() => setIsAddingEntry(true)}
                      className="w-full py-3 border-2 border-dashed border-jp-border rounded-2xl text-jp-muted flex items-center justify-center gap-2 active:bg-jp-border/10"
                    >
                      <Plus size={18} /> 新增登記
                    </button>

                    {calculations.vendorDetails.map(vendor => (
                      <div key={vendor.name} className="glass-card rounded-2xl overflow-hidden">
                        <button 
                          onClick={() => setExpandedVendor(expandedVendor === vendor.name ? null : vendor.name)}
                          className="w-full p-4 flex items-center justify-between hover:bg-black/[0.02]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-jp-accent/10 text-jp-accent flex items-center justify-center font-bold text-xs">
                              <ClipboardList size={14} />
                            </div>
                            <div className="text-left">
                              <p className="font-bold">{vendor.name}</p>
                              <p className="text-[10px] text-jp-muted">{vendor.entries.length} 筆明細</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="font-display font-bold text-sm">${vendor.registered.toLocaleString()}</p>
                            {expandedVendor === vendor.name ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </button>
                        
                        <AnimatePresence>
                          {expandedVendor === vendor.name && (
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              className="overflow-hidden border-t border-jp-border/50 bg-jp-bg/30"
                            >
                              <div className="p-2 space-y-1">
                                {vendor.entries.map(e => (
                                  <div key={e.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/50 group">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium">{e.person_name}</p>
                                      <p className="text-[10px] text-jp-muted">
                                        ${e.unit_price.toLocaleString()} × {e.quantity}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <p className="text-sm font-display font-bold mr-2">${(e.unit_price * e.quantity).toLocaleString()}</p>
                                      <button 
                                        onClick={(e_stop) => {
                                          e_stop.stopPropagation();
                                          handleEditEntry(e);
                                        }}
                                        className="p-2 text-jp-accent bg-jp-accent/5 hover:bg-jp-accent/10 rounded-full transition-colors"
                                        title="修改"
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button 
                                        onClick={(e_stop) => {
                                          e_stop.stopPropagation();
                                          handleDeleteEntry(e.id);
                                        }}
                                        className="p-2 text-jp-secondary bg-jp-secondary/5 hover:bg-jp-secondary/10 rounded-full transition-colors"
                                        title="刪除"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 glass-card border-t border-jp-border safe-bottom z-40">
        <div className="max-w-md mx-auto flex justify-around p-3">
          <button 
            onClick={() => setView('periods')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'periods' || (view === 'period_detail') ? 'text-jp-accent' : 'text-jp-muted'}`}
          >
            <Calendar size={20} />
            <span className="text-[10px] font-medium">獎金檔期</span>
          </button>
          <button 
            onClick={() => setView('roster')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'roster' ? 'text-jp-accent' : 'text-jp-muted'}`}
          >
            <Users size={20} />
            <span className="text-[10px] font-medium">名冊管理</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      <AnimatePresence>
        {/* Add Roster Modal */}
        {isAddingRoster && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingRoster(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-8 shadow-xl"
            >
              <h3 className="text-xl font-display font-bold mb-6">新增人員</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">姓名</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={newRosterName}
                    onChange={(e) => setNewRosterName(e.target.value)}
                    className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                    placeholder="輸入姓名..."
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-jp-bg rounded-2xl">
                  <span className="text-sm">預設參與平分</span>
                  <button 
                    onClick={() => setNewRosterEligible(!newRosterEligible)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${newRosterEligible ? 'bg-jp-accent' : 'bg-jp-border'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${newRosterEligible ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
                <button 
                  onClick={handleAddRoster}
                  className="w-full py-4 bg-jp-accent text-white rounded-2xl font-bold shadow-lg shadow-jp-accent/20 active:scale-[0.98] transition-transform"
                >
                  確認新增
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Add Period Modal */}
        {isAddingPeriod && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingPeriod(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-8 shadow-xl"
            >
              <h3 className="text-xl font-display font-bold mb-6">建立新檔期</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">檔期名稱</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={newPeriodName}
                    onChange={(e) => setNewPeriodName(e.target.value)}
                    className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                    placeholder="例如：2024 第一季獎金"
                  />
                </div>
                <button 
                  onClick={handleAddPeriod}
                  className="w-full py-4 bg-jp-accent text-white rounded-2xl font-bold shadow-lg shadow-jp-accent/20 active:scale-[0.98] transition-transform"
                >
                  建立檔期
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Add Entry Modal */}
        {isAddingEntry && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAddingEntry(false);
                setEditingEntryId(null);
                setNewEntry({ vendor: '', unit_price: '', person_quantities: {} });
              }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-8 shadow-xl max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-xl font-display font-bold mb-6">{editingEntryId ? '修改登記' : '登記獎金'}</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">廠商名稱</label>
                    <input 
                      type="text" 
                      list="vendor-suggestions"
                      value={newEntry.vendor}
                      onChange={(e) => setNewEntry({ ...newEntry, vendor: e.target.value })}
                      className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                      placeholder="輸入或選擇..."
                    />
                    <datalist id="vendor-suggestions">
                      {uniqueVendors.map(v => <option key={v} value={v} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">獎金單價</label>
                    <input 
                      type="number" 
                      value={newEntry.unit_price}
                      onChange={(e) => setNewEntry({ ...newEntry, unit_price: e.target.value })}
                      className="w-full p-4 bg-jp-bg rounded-2xl outline-none focus:ring-2 ring-jp-accent/20"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-jp-muted uppercase mb-2 block">
                    人員銷售數量
                  </label>
                  <div className="space-y-2 max-h-64 overflow-y-auto p-1 bg-jp-bg/50 rounded-2xl border border-jp-border/30">
                    {roster.length === 0 ? (
                      <div className="py-4 text-center text-xs text-jp-muted">請先至名冊管理新增人員</div>
                    ) : (
                      roster.map(r => (
                        <div key={r.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-jp-border/50">
                          <span className="text-sm font-medium">{r.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-jp-muted">數量:</span>
                            <input 
                              type="number"
                              min="0"
                              value={newEntry.person_quantities[r.id] || ''}
                              onChange={(e) => handleQuantityChange(r.id, e.target.value)}
                              className="w-20 p-2 bg-jp-bg rounded-lg text-right text-sm outline-none focus:ring-1 ring-jp-accent/50"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <button 
                  onClick={handleAddEntry}
                  className="w-full py-4 bg-jp-accent text-white rounded-2xl font-bold shadow-lg shadow-jp-accent/20 active:scale-[0.98] transition-transform"
                >
                  {editingEntryId ? '儲存修改' : '確認登記'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
