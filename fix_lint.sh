#!/bin/bash

# 1. /app/Frontend/src/components/CollaboratorItem.jsx
sed -i 's/export const CollaboratorItem/const CollaboratorItem/g' Frontend/src/components/CollaboratorItem.jsx
sed -i '$a export default CollaboratorItem;' Frontend/src/components/CollaboratorItem.jsx
# Need to check how CollaboratorItem is exported and imported

# 2. /app/Frontend/src/components/EditorToolbar.jsx
sed -i 's/\[selectedLanguage, filename\]/[selectedLanguage, filename, onToggleMarkdown, showMarkdown]/' Frontend/src/components/EditorToolbar.jsx

# 3. /app/Frontend/src/components/MarkdownPreview.jsx
sed -i 's/\\>/>/g' Frontend/src/components/MarkdownPreview.jsx
sed -i 's/\\-/-/g' Frontend/src/components/MarkdownPreview.jsx

# 4. /app/Frontend/src/hooks/useAwarenessCursors.js
sed -i 's/import { useEffect, useState } from "react"/import { useState } from "react"/' Frontend/src/hooks/useAwarenessCursors.js
sed -i 's/import { useEffect } from "react"//' Frontend/src/hooks/useAwarenessCursors.js

# 5. /app/Frontend/src/pages/EditorPage.jsx
sed -i 's/, formatRelativeTime//' Frontend/src/pages/EditorPage.jsx
sed -i 's/code, //g' Frontend/src/pages/EditorPage.jsx
sed -i 's/\[roomId, hasFetchedHistory\]/[roomId, hasFetchedHistory, role]/' Frontend/src/pages/EditorPage.jsx
