import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Eye, Trash2, Edit2, Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface HealthUpdate {
  date: string;
  bloodPressure: string;
  heartRate: number;
  temperature: number;
  notes?: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other";
  admitDate?: string;
  diagnosis?: string;
  email?: string;
  phone?: string;
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
  diagnosisCount: number;
  createdAt: string;
  healthUpdates?: HealthUpdate[];
}

interface PatientRow {
  id: string;
  created_at: string;
  user_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;

  admit_date: string | null;
  diagnosis: string | null;
  email: string | null;
  phone: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  address: string | null;

  diagnosis_count: number;
}

function mapPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth || undefined,
    gender: row.gender || undefined,

    admitDate: row.admit_date || undefined,
    diagnosis: row.diagnosis || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    guardianName: row.guardian_name || undefined,
    guardianPhone: row.guardian_phone || undefined,
    address: row.address || undefined,

    diagnosisCount: row.diagnosis_count,
    createdAt: row.created_at.slice(0, 10),
    healthUpdates: [],
  };
}

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPatientGraph, setExpandedPatientGraph] =
    useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "male" as "male" | "female" | "other",

    admitDate: "",
    diagnosis: "",
    email: "",
    phone: "",
    guardianName: "",
    guardianPhone: "",
    address: "",
  });

  useEffect(() => {
    const fetchPatients = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fetch error:", error);
        setError("Failed to load patients");
        setPatients([]);
      } else if (data) {
        setPatients((data as PatientRow[]).map(mapPatient));
      }

      setLoading(false);
    };

    fetchPatients();
  }, []);

  const filteredPatients = patients.filter(
    (p) =>
      p.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.lastName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreatePatient = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!formData.firstName || !formData.lastName) return;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("No logged-in user", userError);
    alert("You must be logged in to create a patient.");
    return;
  }

  const { data, error } = await supabase
    .from("patients")
    .insert({
      user_id: user.id,
      first_name: formData.firstName,
      last_name: formData.lastName,
      date_of_birth: formData.dateOfBirth || null,
      gender: formData.gender,

      admit_date: formData.admitDate || null,
      diagnosis: formData.diagnosis || null,
      email: formData.email || null,
      phone: formData.phone || null,
      guardian_name: formData.guardianName || null,
      guardian_phone: formData.guardianPhone || null,
      address: formData.address || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Insert error:", error);

    // Duplicate: first name + last name + DOB
    if (error.message.includes("unique_patient_name_dob")) {
      alert(
        "A patient with the same first name, last name and date of birth already exists."
      );
      return;
    }

    // Duplicate: email
    if (error.message.includes("unique_patient_email")) {
      alert("This email address is already used by another patient.");
      return;
    }

    alert("Failed to create patient.");
    return;
  }

  if (data) {
    const newPatient = mapPatient(data as PatientRow);
    setPatients((prev) => [...prev, newPatient]);
  }

    setFormData({
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: "male",

      admitDate: "",
      diagnosis: "",
      email: "",
      phone: "",
      guardianName: "",
      guardianPhone: "",
      address: "",
    });

    setShowForm(false);
  };

  const handleDeletePatient = async (id: string) => {
    const { error } = await supabase.from("patients").delete().eq("id", id);

    if (error) {
      console.error("Delete error:", error);
      alert("Failed to delete patient");
      return;
    }

    setPatients((prev) => prev.filter((p) => p.id !== id));
  };

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading patients...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">
            Patient Management
          </h1>
          <p className="text-muted-foreground">
            Create and manage patient records
          </p>
        </div>

        <Button
          onClick={() => setShowForm(!showForm)}
          className="gap-2"
          variant={showForm ? "secondary" : "default"}
        >
          <Plus className="w-4 h-4" />
          {showForm ? "Cancel" : "Create Patient"}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border bg-card p-6 animate-slide-up">
          <h2 className="text-lg font-semibold mb-4">New Patient</h2>

          <form onSubmit={handleCreatePatient} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <InputField label="First Name *" value={formData.firstName} onChange={(v) => setFormData({ ...formData, firstName: v })} />
              <InputField label="Last Name *" value={formData.lastName} onChange={(v) => setFormData({ ...formData, lastName: v })} />

              <InputField type="date" label="Date of Birth" value={formData.dateOfBirth} onChange={(v) => setFormData({ ...formData, dateOfBirth: v })} />

              <div>
                <label className="text-sm font-medium mb-1 block">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      gender: e.target.value as "male" | "female" | "other",
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <InputField type="date" label="Admit Date" value={formData.admitDate} onChange={(v) => setFormData({ ...formData, admitDate: v })} />
              <InputField label="Diagnosis" value={formData.diagnosis} onChange={(v) => setFormData({ ...formData, diagnosis: v })} />
              <InputField label="Email" value={formData.email} onChange={(v) => setFormData({ ...formData, email: v })} />
              <InputField label="Phone" value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v })} />
              <InputField label="Guardian Name" value={formData.guardianName} onChange={(v) => setFormData({ ...formData, guardianName: v })} />
              <InputField label="Guardian Phone" value={formData.guardianPhone} onChange={(v) => setFormData({ ...formData, guardianPhone: v })} />

              <div className="md:col-span-2">
                <label className="text-sm font-medium mb-1 block">Address</label>
                <textarea
                  placeholder="Full address"
                  className="w-full p-2 rounded-lg border border-input bg-background"
                  rows={3}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit">Create Patient</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div>
        <Input
          placeholder="Search by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filteredPatients.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          No patients found.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPatients.map((patient) => (
            <div
              key={patient.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex justify-between">
                <div>
                  <h3 className="font-semibold text-lg">
                    {patient.firstName} {patient.lastName}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {patient.dateOfBirth} · {patient.gender}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Link to={`/patients/${patient.id}`}>
                    <Button size="sm" variant="outline">
                      <Eye className="w-4 h-4" /> View
                    </Button>
                  </Link>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeletePatient(patient.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <Input
        type={type}
        value={value}
        placeholder={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
 