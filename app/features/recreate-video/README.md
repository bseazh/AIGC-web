# Recreate Video Feature

This folder owns the recreate-video workflow internals.

- Route entry: `app/create/recreate-video/page.tsx`
- Current workspace shell: `app/components/recreate-video-page.tsx`
- Shared feature exports: `app/features/recreate-video/index.ts`
- Types: `app/features/recreate-video/types.ts`
- Constants and workflow steps: `app/features/recreate-video/constants.ts`
- Draft persistence helpers: `app/features/recreate-video/drafts.ts`
- Draft API client: `app/features/recreate-video/api.ts`
- Media helpers: `app/features/recreate-video/media.ts`
- Browser media helpers: `app/features/recreate-video/browser-media.ts`
- Built-in prompts: `app/features/recreate-video/prompts.ts`
- Workflow progress helpers: `app/features/recreate-video/workflow.ts`
- Task state hook: `app/features/recreate-video/hooks/use-recreate-task.ts`
- Source video hook: `app/features/recreate-video/hooks/use-recreate-source.ts`
- Keyframe and collage hook: `app/features/recreate-video/hooks/use-recreate-keyframes.ts`
- Materials state hook: `app/features/recreate-video/hooks/use-recreate-materials.ts`
- Project gate UI: `app/features/recreate-video/components/recreate-project-gate.tsx`
- Preview modal UI: `app/features/recreate-video/components/recreate-preview-modal.tsx`
- Step list UI: `app/features/recreate-video/components/recreate-step-list.tsx`
- Workspace sidebar UI: `app/features/recreate-video/components/recreate-workspace-sidebar.tsx`
- Step panels: `app/features/recreate-video/components/panels/`

Next extraction targets:

1. Move the heavier materials side effects, such as material analysis, privacy multiview generation, and face masking, behind `useRecreateMaterials`.
2. Extract draft loading/saving and workflow logs once the remaining submit path is smaller.
