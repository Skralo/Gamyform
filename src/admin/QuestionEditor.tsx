import { newId } from "../id";
// Adapted from screens/edit-field-dialog/index.tsx in hasanharman/form-builder.
// MIT © 2025 Hasan Harman. See third_party/form-builder/LICENSE.
import type { Question } from "../domain";
import { newQuestion } from "../domain";
import { Plus, Trash2 } from "lucide-react";
export const types = {
  single_choice: "Multiple choice",
  number: "Number",
  short_text: "Short answer",
  email: "Email address",
  boolean: "Yes / No",
};
export function QuestionEditor({
  field,
  onSave,
}: {
  field: Question;
  onSave: (q: Question) => void;
}) {
  const set = (patch: Partial<Question>) => onSave({ ...field, ...patch });
  return (
    <div className="field-editor">
      <div className="eyebrow">QUESTION SETTINGS</div>
      <label>
        Question type
        <select
          value={field.type}
          onChange={(e) => {
            if (
              window.confirm("Change type? Type-specific settings will reset.")
            )
              onSave({
                ...newQuestion(e.target.value as Question["type"]),
                id: field.id,
                label: field.label,
                help: field.help,
                required: field.required,
              });
          }}
        >
          {Object.entries(types).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        Question
        <input
          maxLength={180}
          value={field.label}
          onChange={(e) => set({ label: e.target.value })}
        />
      </label>
      <label>
        A little extra context
        <textarea
          maxLength={180}
          value={field.help}
          onChange={(e) => set({ help: e.target.value })}
          rows={2}
          placeholder="Optional hint for your visitor"
        />
      </label>
      {field.type === "single_choice" && (
        <div>
          <div className="label">Answer options</div>
          {field.options?.map((o, i) => (
            <div className="option-edit" key={o.id}>
              <span>{String.fromCharCode(65 + i)}</span>
              <input
                aria-label={"Option " + (i + 1)}
                maxLength={80}
                value={o.label}
                onChange={(e) =>
                  set({
                    options: field.options!.map((x) =>
                      x.id === o.id ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                className="icon-button"
                aria-label={"Remove option " + (i + 1)}
                disabled={field.options!.length <= 2}
                onClick={() =>
                  set({ options: field.options!.filter((x) => x.id !== o.id) })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            className="text-button"
            disabled={(field.options?.length ?? 0) >= 6}
            onClick={() =>
              set({
                options: [
                  ...field.options!,
                  { id: newId(), label: "New option" },
                ],
              })
            }
          >
            <Plus size={15} /> Add option
          </button>
        </div>
      )}
      {field.type === "number" && (
        <div className="two-cols">
          {(["min", "max", "step", "displayStart"] as const).map((k) => (
            <label key={k}>
              {
                {
                  min: "Minimum",
                  max: "Maximum",
                  step: "Step size",
                  displayStart: "Starting display",
                }[k]
              }
              <input
                type="number"
                value={field[k] ?? ""}
                onChange={(e) =>
                  set({
                    [k]:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      {["short_text", "email"].includes(field.type) && (
        <label>
          Character limit
          <input
            type="number"
            min={1}
            max={field.type === "email" ? 254 : 500}
            value={field.maxLength ?? 120}
            onChange={(e) => set({ maxLength: Number(e.target.value) })}
          />
        </label>
      )}
      {["short_text", "email"].includes(field.type) && (
        <label>
          Contact column
          <select
            value={field.contactRole ?? ""}
            onChange={(e) =>
              set({
                contactRole: (e.target.value ||
                  undefined) as Question["contactRole"],
              })
            }
          >
            <option value="">None</option>
            <option value={field.type === "email" ? "email" : "name"}>
              {field.type === "email" ? "Email" : "Name"}
            </option>
          </select>
        </label>
      )}
      <label className="switch-row">
        <span>
          Required answer<small>Visitors must answer before continuing.</small>
        </span>
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => set({ required: e.target.checked })}
        />
      </label>
    </div>
  );
}
