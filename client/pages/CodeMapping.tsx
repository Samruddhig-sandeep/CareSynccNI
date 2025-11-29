import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Search,
  ArrowRight,
  Edit2,
  Trash2,
  Copy,
  Eye,
  Download,
  Plus,
} from "lucide-react";
import Papa from "papaparse";
import Modal from "@/components/ui/modal.tsx";
import { useToast } from "@/components/ui/use-toast";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Pie } from "react-chartjs-2";
import { cn } from "@/lib/utils";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function CodeMapping() {
  const toast = useToast();

  const [mappings, setMappings] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
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

  // Fetch mappings
  const fetchMappings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("codemap")
      .select("*")
      .order("created_at", { ascending: false });

    setLoading(false);
    if (error) {
      console.error(error);
      toast.toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setMappings(data || []);
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  // Normalize keys
  const normalizeKey = (k: string) => k.toString().trim().toLowerCase();

  const mapRowToCodemap = (row: Record<string, any>) => {
    const normalized: Record<string, any> = {};
    Object.keys(row || {}).forEach((k) => {
      normalized[normalizeKey(k)] = row[k];
    });

    const find = (keys: string[]) => {
      for (const k of keys) {
        if (normalized[k] !== undefined && String(normalized[k]).trim() !== "") {
          return normalized[k];
        }
      }
      return undefined;
    };

    return {
      namaste_code: find(["namaste_code", "namaste code", "namaste"]) || "",
      namaste_name: find(["namaste_name", "namaste name"]) || null,
      icd11_code: find(["icd11_code", "icd11 code", "icd_code", "icd"]) || "",
      icd11_name: find(["icd11_name", "icd name"]) || null,
      category: find(["category", "system"]) || "Ayurveda",
      symptoms: find(["symptoms", "symptom"]) || null,
      description: find(["description", "desc"]) || null,
      status: (find(["status"]) || "pending").toString().toLowerCase(),
    };
  };

  // Filter duplicates
  const filterOutExisting = async (rows: any[]) => {
    if (!rows.length) return [];

    const existingSet = new Set<string>();
    const chunkSize = 100;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const namasteCodes = chunk.map((r) => r.namaste_code);

      const { data } = await supabase
        .from("codemap")
        .select("namaste_code, icd11_code")
        .in("namaste_code", namasteCodes);

      (data || []).forEach((r: any) => {
        existingSet.add(
          `${r.namaste_code.toLowerCase()}||${r.icd11_code.toLowerCase()}`
        );
      });
    }

    const uniqueRows = rows.filter((r) => {
      const key = `${r.namaste_code.toLowerCase()}||${r.icd11_code.toLowerCase()}`;
      return !existingSet.has(key);
    });

    return {
      uniqueRows,
      skipped: rows.length - uniqueRows.length,
    };
  };

  // CSV upload
  const handleCSVUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const parsed = results.data || [];

        const mapped = parsed
          .map(mapRowToCodemap)
          .filter((r) => r.namaste_code && r.icd11_code);

        const { uniqueRows, skipped } = await filterOutExisting(mapped);

        if (!uniqueRows.length) {
          toast.toast({
            title: "No new rows",
            description: `${mapped.length} rows existed already.`,
          });
          return;
        }

        const { error } = await supabase.from("codemap").insert(uniqueRows);

        if (error) {
          toast.toast({
            title: "Insert error",
            description: error.message,
            variant: "destructive",
          });
          return;
        }

        toast.toast({
          title: "Upload complete",
          description: `Inserted ${uniqueRows.length}, skipped ${skipped}.`,
        });

        fetchMappings();
      },
    });
  };

  // Export CSV
  const handleCSVExport = async () => {
    const { data } = await supabase.from("codemap").select("*");

    if (!data?.length) {
      toast.toast({ title: "No data", description: "Nothing to export." });
      return;
    }

    const csv = Papa.unparse(data);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "codemap_export.csv";
    link.click();

    URL.revokeObjectURL(url);
  };

  // Create manual mapping
  const handleCreateMapping = async (e: any) => {
    e.preventDefault();

    const { error } = await supabase.from("codemap").insert([formData]);

    if (error) {
      toast.toast({
        title: "Insert error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast.toast({ title: "Created" });
    setShowForm(false);
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

    fetchMappings();
  };

  // Edit mapping
  const saveEdit = async (data: any) => {
    const { error } = await supabase
      .from("codemap")
      .update(data)
      .eq("id", data.id);

    if (error) {
      toast.toast({
        title: "Update error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast.toast({ title: "Updated" });
    setEditing(null);
    fetchMappings();
  };

  // Delete mapping
  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("codemap").delete().eq("id", id);

    if (error) {
      toast.toast({
        title: "Delete error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast.toast({ title: "Deleted" });
    fetchMappings();
  };

  const filteredMappings = useMemo(() => {
    const s = search.toLowerCase();
    return mappings.filter((item) => {
      const match =
        item.namaste_code?.toLowerCase().includes(s) ||
        item.namaste_name?.toLowerCase().includes(s) ||
        item.icd11_code?.toLowerCase().includes(s) ||
        item.icd11_name?.toLowerCase().includes(s);

      return (
        match &&
        (filterCategory === "all" || item.category === filterCategory)
      );
    });
  }, [search, filterCategory, mappings]);

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "Ayurveda":
        return "bg-amber-500 text-white shadow-md";
      case "Siddha":
        return "bg-blue-600 text-white shadow-md";
      case "Unani":
        return "bg-green-600 text-white shadow-md";
      default:
        return "bg-gray-400 text-white";
    }
  };

  const getChartData = (item: any) => ({
    labels: item.symptoms
      ? item.symptoms.split(",").map((s: string) => s.trim())
      : [],
    datasets: [
      {
        label: "Count",
        data: item.symptoms
          ? item.symptoms.split(",").map(() => Math.floor(Math.random() * 50 + 1))
          : [],
        backgroundColor: [
          "#f87171",
          "#60a5fa",
          "#34d399",
          "#fbbf24",
          "#a78bfa",
          "#f472b6",
          "#facc15",
        ],
      },
    ],
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Code Mapping</h1>
          <p className="text-muted-foreground">
            Map NAMASTE codes to ICD-11 and manage verification.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mt-2">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            className="hidden"
            onChange={handleCSVUpload}
          />

          <Button
            className="gap-2 px-5 py-3"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" /> Upload Code List
          </Button>

          <Button
            variant="outline"
            className="gap-2 px-5 py-3"
            onClick={handleCSVExport}
          >
            <Download className="w-4 h-4" /> Export Mappings
          </Button>

          <Button
            variant="outline"
            className="gap-2 px-5 py-3"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="w-4 h-4" />
            {showForm ? "Cancel" : "Add Manual Mapping"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search codes, names, symptoms..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {["all", "Ayurveda", "Siddha", "Unani"].map((c) => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium",
                filterCategory === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/80"
              )}
            >
              {c === "all" ? "All Categories" : c}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {filteredMappings.length} of {mappings.length} mappings
        </p>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4 animate-slide-up">
          <h2 className="text-lg font-semibold">Add Manual Mapping</h2>

          <form onSubmit={handleCreateMapping} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">NAMASTE Code *</label>
                <Input
                  value={formData.namaste_code}
                  onChange={(e) =>
                    setFormData({ ...formData, namaste_code: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background"
                >
                  <option value="Ayurveda">Ayurveda</option>
                  <option value="Siddha">Siddha</option>
                  <option value="Unani">Unani</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">NAMASTE Name</label>
              <Input
                value={formData.namaste_name}
                onChange={(e) =>
                  setFormData({ ...formData, namaste_name: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">ICD-11 Code *</label>
                <Input
                  value={formData.icd11_code}
                  onChange={(e) =>
                    setFormData({ ...formData, icd11_code: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">ICD-11 Name</label>
                <Input
                  value={formData.icd11_name}
                  onChange={(e) =>
                    setFormData({ ...formData, icd11_name: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Symptoms</label>
              <Input
                value={formData.symptoms}
                onChange={(e) =>
                  setFormData({ ...formData, symptoms: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={loading}>
                <Plus className="w-4 h-4" />
                Create Mapping
              </Button>

              <Button
                variant="outline"
                type="button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* PART 2 STARTS IN NEXT MESSAGE */}

      {/* LISTING */}
      {filteredMappings.length === 0 ? (
        <p className="text-center text-muted-foreground mt-10">
          No mappings found.
        </p>
      ) : (
        filteredMappings.map((item) => (
          <div
            key={item.id}
            className="
              p-6 rounded-xl mb-6 shadow-sm border
              bg-white 
              dark:bg-black/30 dark:border-white/10 
              backdrop-blur-md
            "
          >
            {/* CATEGORY BADGE */}
            <div className="mb-4">
              <span
                className={`px-4 py-1 text-sm rounded-full font-medium ${categoryColor(
                  item.category
                )}`}
              >
                {item.category}
              </span>
            </div>

            {/* MAIN ROW */}
            <div className="flex items-start justify-between gap-10">
              {/* LEFT SIDE — NAMASTE */}
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 dark:text-primary/70 mb-1">
                  NAMASTE CODE
                </p>

                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold tracking-wide text-primary/60 dark:text-primary/70">
                    {item.namaste_code}
                  </p>

                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(item.namaste_code)
                    }
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition"
                  >
                    <Copy className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  </button>
                </div>

                {item.namaste_name && (
                  <p className="text-lg mt-2 font-semibold text-gray-800 dark:text-white/90">
                    {item.namaste_name}
                  </p>
                )}
              </div>

              {/* ARROW */}
              <div className="flex items-center justify-center">
                <ArrowRight className="w-8 h-8 text-gray-400 dark:text-gray-300" />
              </div>

              {/* RIGHT SIDE — ICD */}
              <div className="flex-1 text-right">
                <p className="text-xs font-semibold text-gray-500 dark:text-primary/70 mb-1">
                  ICD-11 CODE
                </p>

                <div className="flex items-center justify-end gap-2">
                  <p className="text-2xl font-bold tracking-wide text-primary/60 dark:text-primary/70">
                    {item.icd11_code}
                  </p>

                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(item.icd11_code)
                    }
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition"
                  >
                    <Copy className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  </button>
                </div>

                {item.icd11_name && (
                  <p className="text-lg mt-2 font-semibold text-gray-800 dark:text-white/90">
                    {item.icd11_name}
                  </p>
                )}
              </div>
            </div>

            {/* DESCRIPTION */}
            {item.description && (
              <p className="mt-4 text-gray-600 dark:text-gray-300">
                {item.description}
              </p>
            )}

            {/* STATUS */}
            <div className="mt-5 flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  item.status === "verified"
                    ? "bg-green-500"
                    : item.status === "pending"
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
              ></span>

              <span
                className={`text-sm font-medium ${
                  item.status === "verified"
                    ? "text-green-600 dark:text-green-400"
                    : item.status === "pending"
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </span>
            </div>

            {/* ACTION BUTTONS */}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(item)}>
                <Edit2 className="w-4 h-4 mr-1" /> Edit
              </Button>

              <Button variant="outline" size="sm" onClick={() => setViewing(item)}>
                <Eye className="w-4 h-4 mr-1" /> View Details
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(item.id)}
              >
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
            {[
              "namaste_code",
              "namaste_name",
              "icd11_code",
              "icd11_name",
              "category",
              "description",
              "symptoms",
              "status",
            ].map((field) => (
              <div key={field}>
                <p className="text-sm font-medium capitalize">
                  {field.replace("_", " ")}
                </p>
                <Input
                  value={editing[field] ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, [field]: e.target.value })
                  }
                />
              </div>
            ))}

            <div className="flex gap-3 mt-4">
              <Button onClick={() => saveEdit(editing)}>Save Changes</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* VIEW MODAL */}
      {viewing && (
        <Modal
          title={viewing.namaste_name || viewing.namaste_code}
          onClose={() => setViewing(null)}
        >
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
                      legend: { position: "bottom" },
                      tooltip: {
                        callbacks: {
                          label: (context: any) => {
                            const total = context.dataset.data.reduce(
                              (a: number, b: number) => a + b,
                              0
                            );
                            const value = context.raw;
                            const percentage = ((value / total) * 100).toFixed(
                              1
                            );
                            return `${context.label}: ${percentage}% (${value})`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>

              {/* DOWNLOAD */}
              <div className="mt-5 flex justify-end">
                <Button
                  onClick={() => {
                    const csv = `data:text/csv;charset=utf-8,
NAMASTE Code,${viewing.namaste_code}
NAMASTE Name,${viewing.namaste_name}
ICD-11 Code,${viewing.icd11_code}
ICD-11 Name,${viewing.icd11_name}
Category,${viewing.category}
Symptoms,${viewing.symptoms}
Description,${(viewing.description || "").replace(/\n/g, " ")}
Status,${viewing.status}`;

                    const link = document.createElement("a");
                    link.href = encodeURI(csv);
                    link.download = `${viewing.namaste_code}_report.csv`;
                    link.click();
                  }}
                >
                  Download Report
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
