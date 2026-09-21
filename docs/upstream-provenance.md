# Reused source

Source: https://github.com/hasanharman/form-builder
Commit: 9b78fe3b67d10fa04904d615e13f478d91f79f30
License: MIT, Copyright (c) 2025 Hasan Harman.

Unmodified inspected source and its license are retained in third_party/form-builder.
src/components/FormWrapper.tsx adapts screens/form-wrapper/index.tsx: the generic React Hook Form wrapper and resolver flow are retained; local shadcn dependencies are replaced with semantic native controls. Field persistence is explicit.
src/admin/QuestionEditor.tsx adapts screens/edit-field-dialog/index.tsx: controlled field editing flow, label/help/required controls; restricted to the product's five types with a new validated serializable schema, option editing and stable IDs. Raw class names, demo registration fields and Next.js shell are removed.

Other game, API, validation and response code is original to Gamyform. No donor analytics, paid service, proprietary Creator package or tracking IDs are included. Dependencies are independently declared in package.json and locked in package-lock.json.
