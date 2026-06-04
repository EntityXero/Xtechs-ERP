'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface FormFieldSchema {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | string;
  placeholder?: string;
  required?: boolean;
  gridSpan?: number; // 1 or 2
  options?: Array<{ value: string; label: string }>;
}

export interface FormSchemaMetadata {
  fields: FormFieldSchema[];
}

interface DynamicFormProps {
  schema: FormSchemaMetadata;
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
  errors?: Record<string, string>;
}

export function DynamicForm({ schema, values, onChange, errors }: DynamicFormProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {schema.fields.map((field) => {
        const value = values[field.name] ?? '';
        const hasError = !!errors?.[field.name];
        const spanClass = field.gridSpan === 2 ? 'sm:col-span-2' : '';

        return (
          <div key={field.name} className={`space-y-1.5 ${spanClass}`}>
            <Label
              htmlFor={field.name}
              className={`text-[10px] font-bold uppercase tracking-wider font-mono ${
                hasError ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {field.label} {field.required && <span className="text-destructive">*</span>}
            </Label>

            <div className="relative">
              {field.type === 'textarea' ? (
                <textarea
                  id={field.name}
                  value={value}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  className={`w-full rounded-md border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] ${
                    hasError ? 'border-destructive focus:ring-destructive' : 'border-border'
                  }`}
                />
              ) : field.type === 'select' ? (
                <select
                  id={field.name}
                  value={value}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  required={field.required}
                  className={`w-full h-9 rounded-md border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
                    hasError ? 'border-destructive focus:ring-destructive' : 'border-border'
                  }`}
                >
                  <option value="">-- Select Option --</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={field.name}
                  type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                  value={value}
                  onChange={(e) => {
                    const val = field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
                    onChange(field.name, val);
                  }}
                  placeholder={field.placeholder}
                  required={field.required}
                  className={`h-9 text-xs border-border bg-background ${
                    hasError ? 'border-destructive focus:ring-destructive' : ''
                  }`}
                />
              )}
            </div>

            {hasError && (
              <span className="text-[10px] text-destructive font-mono block select-none">
                {errors[field.name]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
