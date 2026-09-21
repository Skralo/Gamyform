// Adapted from hasanharman/form-builder, MIT © 2025 Hasan Harman.
// Original source + license: third_party/form-builder.
import {
  FormProvider,
  useForm,
  type FieldValues,
  type DefaultValues,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { ReactNode } from "react";
export function FormWrapper<T extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  children,
}: {
  schema: z.ZodType<T>;
  defaultValues: DefaultValues<T>;
  onSubmit: (values: T) => void;
  children: (form: UseFormReturn<T>) => ReactNode;
}) {
  const form = useForm<T>({
    resolver: zodResolver(schema as any) as any,
    defaultValues,
    shouldUnregister: false,
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>{children(form)}</form>
    </FormProvider>
  );
}
