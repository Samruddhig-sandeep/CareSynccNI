import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Search,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Download,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Eye,
} from "lucide-react";
import Modal from "@/components/ui/modal.tsx"; // your modal
import Papa from "papaparse";
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast"; // toast from your UI kit

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

export default function CodeMapping() {
  const toast = useToast();

  const [mappings, setMappings] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [formData, setFormData] = useState({
    namaste_code: "",
    namaste_name: "",
    icd11_code: "",
    icd11_name: "",
    category: "Ayurveda",
    symptoms: "",
    description: "",
    status: "pending",
  });

  // fetch mappings
  const fetchMappings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("codemap")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      console.error("Error fetching mappings:", error);
      toast.toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setMappings(data || []);
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  // helpers: normalize CSV header lookup
  const normalizeKey = (k: string) => k.toString().trim().toLowerCase();

  const mapRowToCodemap = (row: Record<string, any>) => {
    const normalized: Record<string, any> = {};
    Object.keys(row || {}).forEach((k) => {
      normalized[normalizeKey(k)] = row[k];
    });

    const find = (candidates: string[]) => {
      for (const c of candidates) {
        if (normalized[c] !== undefined && normalized[c] !== null && String(normalized[c]).trim() !== "") {
          return normalized[c];
        }
      }
      return undefined;
    };

    const namaste_code = find(["namaste_code", "namaste code", "namaste", "namste_code", "namste code"]) || "";
    const namaste_name = find(["namaste_name", "namaste name", "namaste_description", "namaste description"]) || null;
    const icd11_code = find(["icd11_code", "icd11 code", "icd_code", "icd code", "icd11", "icd"]) || "";
    const icd11_name = find(["icd11_name", "icd name", "icd11_name", "icd11 name", "icd_description"]) || null;
    const category = find(["category", "system", "trad_system"]) || "Ayurveda";
    const symptoms = find(["symptoms", "symptom", "symptom_list"]) || null;
    const description = find(["description", "desc", "details"]) || null;
    const status = (find(["status"]) || "pending").toString().toLowerCase();

    return {
      namaste_code: String(namaste_code).trim(),
      namaste_name: namaste_name ? String(namaste_name).trim() : null,
      icd11_code: String(icd11_code).trim(),
      icd11_name: icd11_name ? String(icd11_name).trim() : null,
      category: ["Ayurveda", "Siddha", "Unani"].includes(String(category)) ? String(category) : "Ayurveda",
      symptoms: symptoms ? String(symptoms).trim() : null,
      description: description ? String(description).trim() : null,
      status: ["verified", "pending", "rejected"].includes(String(status)) ? String(status) : "pending",
    };
  };

  // duplicate detection: check DB for existing pairs
  const filterOutExisting = async (rows: any[]) => {
    if (!rows.length) return [];
    // Build set of pairs to check
    const pairs = rows.map((r) => ({ namaste_code: r.namaste_code, icd11_code: r.icd11_code }));
    // Query for any existing duplicates (use or filter large sets in batches)
    const existingSet = new Set<string>();
    // We'll chunk to avoid long query lists
    const chunkSize = 100;
    for (let i = 0; i < pairs.length; i += chunkSize) {
      const chunk = pairs.slice(i, i + chunkSize);
      // create OR filter: (namaste_code.eq.xx,icd11_code.eq.yy) - using filter by in isn't straightforward for composite
      // We'll query where namaste_code in (...) and then check icd11_code locally
      const namasteCodes = Array.from(new Set(chunk.map((p) => p.namaste_code))).filter(Boolean);
      const { data, error } = await supabase
        .from("codemap")
        .select("namaste_code,icd11_code")
        .in("namaste_code", namasteCodes)
        .limit(1000);
      if (error) {
        console.error("Error checking duplicates:", error);
        // On error, be conservative and return original rows (so we don't accidentally skip)
        return rows;
      }
      (data || []).forEach((r: any) => {
        existingSet.add(`${String(r.namaste_code).trim().toLowerCase()}||${String(r.icd11_code).trim().toLowerCase()}`);
      });
    }

    // Filter out rows that exist
    const uniqueRows = rows.filter((r) => {
      const key = `${String(r.namaste_code).trim().toLowerCase()}||${String(r.icd11_code).trim().toLowerCase()}`;
      return !existingSet.has(key);
    });

    const skipped = rows.length - uniqueRows.length;
    return { uniqueRows, skipped };
  };

  // CSV upload handler
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: async (results) => {
        const parsed: any[] = results.data || [];
        if (!parsed.length) {
          toast.toast({ title: "No rows", description: "CSV contains no rows.", variant: "warning" });
          return;
        }

        // Map rows to DB shape and require required fields
        const mapped = parsed.map(mapRowToCodemap).filter((r) => r.namaste_code && r.icd11_code);
        if (!mapped.length) {
          toast.toast({ title: "Invalid CSV", description: "No valid rows with namaste_code and icd11_code found.", variant: "destructive" });
          return;
        }

        setLoading(true);
        try {
          // duplicate detection
          const { uniqueRows, skipped } = await (async () => {
            const res = await filterOutExisting(mapped);
            if (res.uniqueRows) return res;
            // in case filterOutExisting returned array directly (fallback), wrap it
            return { uniqueRows: res as any[], skipped: 0 };
          })();

          if (!uniqueRows.length) {
            toast.toast({ title: "No new rows", description: `All ${mapped.length} rows already exist.`, variant: "warning" });
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
          }

          // insert in chunks
          const chunkSize = 200;
          let inserted = 0;
          for (let i = 0; i < uniqueRows.length; i += chunkSize) {
            const chunk = uniqueRows.slice(i, i + chunkSize);
            const { error } = await supabase.from("codemap").insert(chunk);
            if (error) {
              console.error("Insert error:", error);
              toast.toast({ title: "Insert error", description: error.message, variant: "destructive" });
              setLoading(false);
              return;
            }
            inserted += chunk.length;
          }

          toast.toast({ title: "Upload complete", description: `Inserted ${inserted} rows${skipped ? `, skipped ${skipped} duplicates` : ""}.` });
          await fetchMappings();
          if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err: any) {
          console.error(err);
          toast.toast({ title: "Error", description: "Unexpected error during upload", variant: "destructive" });
        } finally {
          setLoading(false);
        }
      },
      error: (err) => {
        console.error("CSV parse error:", err);
        toast.toast({ title: "CSV parse error", description: String(err.message || err), variant: "destructive" });
      },
    });
  };

  // Export all rows from Supabase to CSV
  const handleCSVExport = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("codemap").select("*").order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      console.error("Export error:", error);
      toast.toast({ title: "Export error", description: error.message, variant: "destructive" });
      return;
    }
    const rows = data || [];
    if (!rows.length) {
      toast.toast({ title: "No data", description: "No rows to export.", variant: "warning" });
      return;
    }

    const csv = Papa.unparse(
      rows.map((r: any) => ({
        id: r.id,
        namaste_code: r.namaste_code,
        namaste_name: r.namaste_name,
        icd11_code: r.icd11_code,
        icd11_name: r.icd11_name,
        category: r.category,
        symptoms: r.symptoms,
        description: r.description,
        status: r.status,
        created_at: r.created_at,
      }))
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "codemap_export.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast.toast({ title: "Exported", description: `Exported ${rows.length} rows.` });
  };

  // Create mapping (manual form)
  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.namaste_code || !formData.icd11_code) {
      toast.toast({ title: "Missing fields", description: "NAMASTE code and ICD-11 code are required", variant: "warning" });
      return;
    }
    setLoading(true);

    // duplicate check: check if pair exists
    const { data: existing, error: checkErr } = await supabase
      .from("codemap")
      .select("id")
      .match({ namaste_code: formData.namaste_code, icd11_code: formData.icd11_code })
      .limit(1);
    if (checkErr) {
      console.error("Duplicate check error:", checkErr);
      toast.toast({ title: "Error", description: checkErr.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    if (existing && existing.length) {
      toast.toast({ title: "Duplicate", description: "A mapping with same NAMASTE+ICD already exists.", variant: "warning" });
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("codemap").insert([{
      namaste_code: formData.namaste_code,
      namaste_name: formData.namaste_name || null,
      icd11_code: formData.icd11_code,
      icd11_name: formData.icd11_name || null,
      category: formData.category,
      symptoms: formData.symptoms || null,
      description: formData.description || null,
      status: formData.status || "pending",
    }]);

    setLoading(false);
    if (error) {
      console.error("Insert error:", error);
      toast.toast({ title: "Insert error", description: error.message, variant: "destructive" });
      return;
    }
    toast.toast({ title: "Created", description: "Mapping created successfully." });
    setFormData({
      namaste_code: "",
      namaste_name: "",
      icd11_code: "",
      icd11_name: "",
      category: "Ayurveda",
      symptoms: "",
      description: "",
      status: "pending",
    });
    setShowForm(false);
    fetchMappings();
  };

  // Save edited mapping
  const saveEdit = async (data: any) => {
    if (!data || !data.id) return;
    setLoading(true);

    // optional duplicate prevention if codes changed
    const { data: dup, error: dupErr } = await supabase
      .from("codemap")
      .select("id")
      .match({ namaste_code: data.namaste_code, icd11_code: data.icd11_code })
      .limit(1);
    if (dupErr) {
      console.error("Dup check err:", dupErr);
    }
    if (dup && dup.length && dup[0].id !== data.id) {
      setLoading(false);
      toast.toast({ title: "Duplicate", description: "Another mapping with same codes exists.", variant: "warning" });
      return;
    }

    const { error } = await supabase
      .from("codemap")
      .update({
        namaste_code: data.namaste_code,
        namaste_name: data.namaste_name || null,
        icd11_code: data.icd11_code,
        icd11_name: data.icd11_name || null,
        category: data.category,
        symptoms: data.symptoms || null,
        description: data.description || null,
        status: data.status || "pending",
      })
      .eq("id", data.id);

    setLoading(false);
    if (error) {
      console.error("Update error:", error);
      toast.toast({ title: "Update error", description: error.message, variant: "destructive" });
      return;
    }
    toast.toast({ title: "Saved", description: "Mapping updated." });
    fetchMappings();
    setEditing(null);
  };

  // Delete mapping
  const handleDelete = async (id: string) => {
    const confirmed = confirm("Delete this mapping?");
    if (!confirmed) return;
    setLoading(true);
    const { error } = await supabase.from("codemap").delete().eq("id", id);
    setLoading(false);
    if (error) {
      console.error("Delete error:", error);
      toast.toast({ title: "Delete error", description: error.message, variant: "destructive" });
      return;
    }
    toast.toast({ title: "Deleted", description: "Mapping deleted." });
    fetchMappings();
  };

  // Download single mapping report as CSV
  const downloadReport = (item: any) => {
    const csvContent = `data:text/csv;charset=utf-8,
NAMASTE Code,${item.namaste_code || ""}
NAMASTE Name,${item.namaste_name || ""}
ICD-11 Code,${item.icd11_code || ""}
ICD-11 Name,${item.icd11_name || ""}
Category,${item.category || ""}
Symptoms,${item.symptoms || ""}
Description,${(item.description || "").replace(/\n/g, " ")}
Status,${item.status || ""}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${(item.namaste_code || "report")}_report.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // filtered list for UI
  const filteredMappings = useMemo(() => {
    const s = search.toLowerCase();
    return mappings.filter((item) => {
      const matchesSearch =
        (item.namaste_code || "").toString().toLowerCase().includes(s) ||
        (item.namaste_name || "").toString().toLowerCase().includes(s) ||
        (item.icd11_code || "").toString().toLowerCase().includes(s) ||
        (item.icd11_name || "").toString().toLowerCase().includes(s) ||
        (item.category || "").toString().toLowerCase().includes(s) ||
        (item.symptoms || "").toString().toLowerCase().includes(s) ||
        (item.description || "").toString().toLowerCase().includes(s);

      const matchesCategory = filterCategory === "all" || (item.category === filterCategory);
      return matchesSearch && matchesCategory;
    });
  }, [mappings, search, filterCategory]);

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "Ayurveda": return "bg-amber-500 text-white shadow-md";
      case "Siddha": return "bg-blue-600 text-white shadow-md";
      case "Unani": return "bg-green-600 text-white shadow-md";
      default: return "bg-gray-400 text-white";
    }
  };

  const getChartData = (item: any) => ({
    labels: item.symptoms ? item.symptoms.split(",").map((s: string) => s.trim()) : [],
    datasets: [{
      label: "Count",
      data: item.symptoms ? item.symptoms.split(",").map(() => Math.floor(Math.random() * 50 + 1)) : [],
      backgroundColor: ["#f87171", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#facc15"]
    }]
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Code Mapping</h1>
          <p className="text-gray-600 mb-2">Map NAMASTE codes to ICD-11 and manage verification status.</p>
        </div>

        {/* Buttons header (styled like your screenshot) */}
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            className="hidden"
            onChange={handleCSVUpload}
          />

          <Button
            className="gap-2 px-5 py-3 font-medium"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            <Upload className="w-4 h-4" />
            Upload Code List
          </Button>

          <Button
            variant="outline"
            className="gap-2 px-5 py-3 font-medium"
            onClick={handleCSVExport}
            disabled={loading}
          >
            <Download className="w-4 h-4" />
            Export Mappings
          </Button>

          <Button
            variant="outline"
            className="gap-2 px-5 py-3 font-medium"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="w-4 h-4" />
            {showForm ? "Cancel" : "Add Manual Mapping"}
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search NAMASTE name, ICD name, symptoms, description..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {["all", "Ayurveda", "Siddha", "Unani"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                filterCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/80"
              )}
            >
              {cat === "all" ? "All Categories" : cat}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {filteredMappings.length} of {mappings.length} mappings
        </p>
      </div>

      {/* Manual Mapping Form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-6 animate-slide-up space-y-4">
          <h2 className="text-lg font-semibold">Add Manual Mapping</h2>
          <form onSubmit={handleCreateMapping} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">NAMASTE Code *</label>
                <Input
                  placeholder="e.g., AYU-VAT-001"
                  value={formData.namaste_code}
                  onChange={(e) => setFormData({ ...formData, namaste_code: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background"
                >
                  <option value="Ayurveda">Ayurveda</option>
                  <option value="Siddha">Siddha</option>
                  <option value="Unani">Unani</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">NAMASTE Name</label>
              <Input
                placeholder="Name of NAMASTE condition"
                value={formData.namaste_name}
                onChange={(e) => setFormData({ ...formData, namaste_name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">ICD-11 Code *</label>
                <Input
                  placeholder="e.g., MB23.1"
                  value={formData.icd11_code}
                  onChange={(e) => setFormData({ ...formData, icd11_code: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ICD-11 Name</label>
                <Input
                  placeholder="ICD-11 condition name"
                  value={formData.icd11_name}
                  onChange={(e) => setFormData({ ...formData, icd11_name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Symptoms (comma separated)</label>
              <Input
                placeholder="dry skin, constipation, anxiety"
                value={formData.symptoms}
                onChange={(e) => setFormData({ ...formData, symptoms: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Brief description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="gap-2" disabled={loading}>
                <Plus className="w-4 h-4" />
                Create Mapping
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={loading}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Listing */}
      {filteredMappings.length === 0 ? (
        <p className="text-gray-500 text-center mt-10">No mappings found.</p>
      ) : (
        filteredMappings.map((item) => (
          <div key={item.id} className="border p-6 rounded-xl mb-6 shadow-sm bg-white">
            <div className="mb-4">
              <span className={`px-4 py-1 text-sm rounded-full font-medium ${categoryColor(item.category)}`}>
                {item.category}
              </span>
            </div>

            <div className="flex items-start justify-between gap-10">
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 mb-1">NAMASTE CODE</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold tracking-wide">{item.namaste_code}</p>
                  <button onClick={() => navigator.clipboard.writeText(item.namaste_code)} className="p-1 rounded hover:bg-gray-100">
                    <Copy className="w-5 h-5 text-gray-700" />
                  </button>
                </div>
                {item.namaste_name && <p className="text-lg mt-2 font-semibold text-gray-800">{item.namaste_name}</p>}
                
              </div>

              <div className="flex items-center justify-center">
                <ArrowRight className="w-8 h-8 text-gray-400" />
              </div>

              <div className="flex-1 text-right">
                <p className="text-xs font-semibold text-gray-500 mb-1">ICD-11 CODE</p>
                <div className="flex items-center justify-end gap-2">
                  <p className="text-2xl font-bold tracking-wide">{item.icd11_code}</p>
                  <button onClick={() => navigator.clipboard.writeText(item.icd11_code)} className="p-1 rounded hover:bg-gray-100">
                    <Copy className="w-5 h-5 text-gray-700" />
                  </button>
                </div>
                {item.icd11_name && <p className="text-lg mt-2 font-semibold text-gray-800">{item.icd11_name}</p>}
              </div>
            </div>

            {item.description && <p className="mt-4 text-gray-600">{item.description}</p>}

            <div className="mt-5 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${
                item.status === "verified" ? "bg-green-500" :
                item.status === "pending" ? "bg-yellow-500" : "bg-red-500"
              }`}></span>
              <span className={`text-sm font-medium ${
                item.status === "verified" ? "text-green-600" :
                item.status === "pending" ? "text-yellow-600" : "text-red-600"
              }`}>
                {(item.status || "pending").charAt(0).toUpperCase() + (item.status || "pending").slice(1)}
              </span>
            </div>

            {/* EDIT, VIEW, DELETE */}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(item)}>
                <Edit2 className="w-4 h-4 mr-1" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setViewing(item)}>
                <Eye className="w-4 h-4 mr-1" /> View Details
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            </div>
          </div>
        ))
      )}

      {/* EDIT MODAL */}
      {editing && (
        <Modal title="Edit Code Mapping" onClose={() => setEditing(null)}>
          <div className="flex flex-col gap-3 max-w-2xl w-full">
            {["namaste_code","namaste_name","icd11_code","icd11_name","category","description","symptoms","status"].map((field) => (
              <div key={field}>
                <p className="text-sm font-medium capitalize">{field.replace("_"," ")}</p>
                <Input
                  value={editing[field]}
                  onChange={(e) => setEditing({...editing, [field]: e.target.value})}
                />
              </div>
            ))}
            <div className="flex gap-2 mt-4">
              <Button onClick={() => saveEdit(editing)} disabled={loading}>Save & Set Pending</Button>
              <Button variant="outline" onClick={() => setEditing(null)} disabled={loading}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* VIEW DETAILS MODAL */}
      {viewing && (
        <Modal title={viewing.namaste_name || viewing.namaste_code} onClose={() => setViewing(null)}>
          <div className="max-w-4xl w-full max-h-[85vh] overflow-y-auto px-4">
            <div className="flex flex-col gap-3 pb-6">
              <p><strong>NAMASTE Code:</strong> {viewing.namaste_code}</p>
              <p><strong>NAMASTE Name:</strong> {viewing.namaste_name}</p>
              <p><strong>ICD-11 Code:</strong> {viewing.icd11_code}</p>
              <p><strong>ICD-11 Name:</strong> {viewing.icd11_name}</p>
              <p><strong>Category:</strong> {viewing.category}</p>
              <p><strong>Symptoms:</strong> {viewing.symptoms}</p>
              <p><strong>Description:</strong> {viewing.description}</p>
              <p><strong>Status:</strong> {viewing.status}</p>

              {/* PIE CHART */}
              <div className="mt-4 flex justify-center">
                <Pie
                  data={getChartData(viewing)}
                  options={{
                    plugins: {
                      tooltip: {
                        callbacks: {
                          label: function(context: any) {
                            const total = context.dataset.data.reduce((a: number,b:number)=>a+b,0);
                            const value = context.raw as number;
                            const percentage = ((value/total)*100).toFixed(1);
                            return `${context.label}: ${percentage}% (${value})`;
                          }
                        }
                      },
                      legend: { position: "bottom" }
                    }
                  }}
                />
              </div>

              {/* DOWNLOAD BUTTON */}
              <div className="mt-5 flex justify-end">
                <Button onClick={() => downloadReport(viewing)}>Download Report</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
