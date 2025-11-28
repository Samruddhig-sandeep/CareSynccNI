import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Download, Plus, Trash2 } from "lucide-react";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other";
  admitDate?: string;
  email?: string;
  phone?: string;
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
  createdAt: string;
}

interface PatientRow {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;
  admit_date: string | null;
  email: string | null;
  phone: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  address: string | null;
}

interface Diagnosis {
  id: string;
  namasteCode: string;
  icd11Code: string;
  symptoms?: string;
  clinicalNotes?: string;
  recordedAt: string;
}

interface DiagnosisRow {
  id: string;
  created_at: string;
  patient_id: string;
  namaste_code: string;
  icd11_code: string;
  symptoms: string | null;
  clinical_notes: string | null;
}

function mapPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth || undefined,
    gender: row.gender || undefined,
    admitDate: row.admit_date || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    guardianName: row.guardian_name || undefined,
    guardianPhone: row.guardian_phone || undefined,
    address: row.address || undefined,
    createdAt: row.created_at.slice(0, 19).replace("T", " "),
  };
}

function mapDiagnosis(row: DiagnosisRow): Diagnosis {
  return {
    id: row.id,
    namasteCode: row.namaste_code,
    icd11Code: row.icd11_code,
    symptoms: row.symptoms || undefined,
    clinicalNotes: row.clinical_notes || undefined,
    recordedAt: row.created_at.slice(0, 19).replace("T", " "),
  };
}

export default function PatientDetail() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    namasteCode: "",
    icd11Code: "",
    symptoms: "",
    clinicalNotes: "",
  });

  useEffect(() => {
    const load = async () => {
      if (!patientId) return;

      setLoading(true);

      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("id", patientId)
        .maybeSingle();

      if (patientError) {
        console.error("Patient load error:", patientError);
        setPatient(null);
        setLoading(false);
        return;
      }

      if (patientData) {
        setPatient(mapPatient(patientData as PatientRow));
      } else {
        setPatient(null);
      }

      const { data: diagData, error: diagError } = await supabase
        .from("patient_diagnoses")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: true });

      if (diagError) {
        console.error("Diagnosis load error:", diagError);
        setDiagnoses([]);
      } else if (diagData) {
        setDiagnoses((diagData as DiagnosisRow[]).map(mapDiagnosis));
      }

      setLoading(false);
    };

    load();
  }, [patientId]);

  const handleAddDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient || !formData.namasteCode || !formData.icd11Code) return;

    const { data, error } = await supabase
      .from("patient_diagnoses")
      .insert({
        patient_id: patient.id,
        namaste_code: formData.namasteCode,
        icd11_code: formData.icd11Code,
        symptoms: formData.symptoms || null,
        clinical_notes: formData.clinicalNotes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Add diagnosis error:", error);
      alert("Failed to add diagnosis.");
      return;
    }

    if (data) {
      const newDiag = mapDiagnosis(data as DiagnosisRow);
      setDiagnoses((prev) => [...prev, newDiag]);
    }

    setFormData({
      namasteCode: "",
      icd11Code: "",
      symptoms: "",
      clinicalNotes: "",
    });
    setShowForm(false);
  };

  const handleDeleteDiagnosis = async (id: string) => {
    const ok = window.confirm("Delete this diagnosis?");
    if (!ok) return;

    const { error } = await supabase
      .from("patient_diagnoses")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete diagnosis error:", error);
      alert("Failed to delete diagnosis.");
      return;
    }

    setDiagnoses((prev) => prev.filter((d) => d.id !== id));
  };

  const exportFHIR = () => {
    if (!patient) return;

    const bundle = {
      resourceType: "Bundle",
      type: "document",
      timestamp: new Date().toISOString(),
      entry: [
        {
          resource: {
            resourceType: "Patient",
            id: patient.id,
            name: [
              {
                use: "official",
                given: [patient.firstName],
                family: patient.lastName,
              },
            ],
            birthDate: patient.dateOfBirth,
            gender: patient.gender,
            telecom: [
              patient.email ? { system: "email", value: patient.email } : null,
              patient.phone ? { system: "phone", value: patient.phone } : null,
            ].filter(Boolean),
            address: patient.address
              ? [
                  {
                    text: patient.address,
                  },
                ]
              : undefined,
          },
        },
        ...diagnoses.map((d) => ({
          resource: {
            resourceType: "Condition",
            id: d.id,
            code: {
              coding: [
                {
                  system: "http://id.who.int/icd/release/11/mms",
                  code: d.icd11Code,
                },
              ],
            },
            subject: {
              reference: `Patient/${patient.id}`,
            },
            recordedDate: d.recordedAt,
            note: [
              ...(d.symptoms ? [{ text: `Symptoms: ${d.symptoms}` }] : []),
              ...(d.clinicalNotes ? [{ text: d.clinicalNotes }] : []),
            ],
          },
        })),
      ],
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patient-${patient.id}-fhir.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6 space-y-4">
        <Link to="/patients">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Patients
          </Button>
        </Link>
        <p className="text-center text-muted-foreground">Patient not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <Link to="/patients" className="text-primary text-sm">
            ← Back to Patients
          </Link>
          <h1 className="text-3xl font-bold mt-2">
            {patient.firstName} {patient.lastName}
          </h1>
          <p className="text-muted-foreground text-sm">
            ID: {patient.id}
          </p>
          <p className="text-xs text-muted-foreground">
            Created: {patient.createdAt}
          </p>
        </div>

        <Button className="gap-2" onClick={exportFHIR}>
          <Download className="w-4 h-4" />
          Export FHIR JSON
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DetailCard label="Date of Birth" value={patient.dateOfBirth} />
        <DetailCard label="Gender" value={patient.gender} />
        <DetailCard label="Admit Date" value={patient.admitDate} />
        <DetailCard label="Email" value={patient.email} />
        <DetailCard label="Phone" value={patient.phone} />
        <DetailCard label="Guardian Name" value={patient.guardianName} />
        <DetailCard label="Guardian Phone" value={patient.guardianPhone} />

        <div className="rounded-lg border border-border p-4 md:col-span-3">
          <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">
            Address
          </p>
          <p className="text-lg">{patient.address || "—"}</p>
        </div>
      </div>

      <div className="space-y-4 border-t border-border pt-8">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Diagnoses</h2>
          <Button
            size="sm"
            variant={showForm ? "secondary" : "default"}
            onClick={() => setShowForm((v) => !v)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            {showForm ? "Cancel" : "Add Diagnosis"}
          </Button>
        </div>

        {showForm && (
          <div className="rounded-lg border border-border p-4">
            <form onSubmit={handleAddDiagnosis} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField
                  label="Namaste Code *"
                  value={formData.namasteCode}
                  onChange={(v) =>
                    setFormData({ ...formData, namasteCode: v })
                  }
                />
                <InputField
                  label="ICD-11 Code *"
                  value={formData.icd11Code}
                  onChange={(v) =>
                    setFormData({ ...formData, icd11Code: v })
                  }
                />
              </div>

              <div>
                <label className="text-sm mb-1 block">Symptoms</label>
                <textarea
                  className="w-full border rounded p-2 text-sm"
                  rows={2}
                  value={formData.symptoms}
                  onChange={(e) =>
                    setFormData({ ...formData, symptoms: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm mb-1 block">Clinical Notes</label>
                <textarea
                  className="w-full border rounded p-2 text-sm"
                  rows={3}
                  value={formData.clinicalNotes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      clinicalNotes: e.target.value,
                    })
                  }
                />
              </div>

              <Button type="submit">Add Diagnosis</Button>
            </form>
          </div>
        )}

        {diagnoses.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No diagnoses recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {diagnoses.map((d) => (
              <div
                key={d.id}
                className="rounded-lg border border-border p-4 flex justify-between gap-4"
              >
                <div className="space-y-1">
                  <p className="font-semibold">
                    {d.namasteCode} → {d.icd11Code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Recorded: {d.recordedAt}
                  </p>
                  {d.symptoms && (
                    <p className="text-sm">
                      <span className="font-semibold">Symptoms: </span>
                      {d.symptoms}
                    </p>
                  )}
                  {d.clinicalNotes && (
                    <p className="text-sm">
                      <span className="font-semibold">Notes: </span>
                      {d.clinicalNotes}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => handleDeleteDiagnosis(d.id)}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">
        {label}
      </p>
      <p className="text-lg">{value || "—"}</p>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm mb-1 block">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
