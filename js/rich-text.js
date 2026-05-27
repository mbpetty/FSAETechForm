let descriptionEditor = null;

function isRichHtml(text) {
  return /<[a-z][\s\S]*>/i.test(String(text ?? ""));
}

function stripDescriptionHtml(html) {
  if (!html) return "";
  if (typeof DOMPurify !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeDescriptionHtml(html) {
  if (!html) return "";
  if (typeof DOMPurify === "undefined") {
    return escapeRichTextFallback(html);
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "ul",
      "ol",
      "li",
      "a",
      "img",
      "h3",
      "h4",
      "blockquote",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "target", "rel"],
  });
}

function escapeRichTextFallback(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function renderDescriptionHtml(html) {
  const safe = sanitizeDescriptionHtml(html);
  if (!safe) return "<p></p>";
  return safe;
}

async function uploadInspectionImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }
  if (file.size > 512 * 1024) {
    throw new Error("Images must be 512 KB or smaller.");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await getSupabase()
    .storage.from("inspection-images")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) {
    throw new Error(
      error.message.includes("Bucket not found")
        ? "Image storage not set up — run sql/07_feedback_features.sql in Supabase."
        : error.message
    );
  }

  const { data } = getSupabase().storage.from("inspection-images").getPublicUrl(path);
  return data.publicUrl;
}

function destroyDescriptionEditor() {
  if (!descriptionEditor) return;
  descriptionEditor = null;
  const mount = document.getElementById("inspection-description-editor");
  if (mount) mount.innerHTML = "";
}

function initDescriptionEditor(initialHtml = "") {
  destroyDescriptionEditor();

  const mount = document.getElementById("inspection-description-editor");
  if (!mount || typeof Quill === "undefined") {
    const fallback = document.getElementById("inspection-description-fallback");
    if (fallback) {
      fallback.hidden = false;
      fallback.value = stripDescriptionHtml(initialHtml) || initialHtml || "";
    }
    return null;
  }

  const fallback = document.getElementById("inspection-description-fallback");
  if (fallback) fallback.hidden = true;

  descriptionEditor = new Quill(mount, {
    theme: "snow",
    placeholder: "Inspection details — use formatting and small images as needed…",
    modules: {
      toolbar: {
        container: [
          ["bold", "italic", "underline"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image"],
          ["clean"],
        ],
        handlers: {
          image: function imageHandler() {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                const url = await uploadInspectionImage(file);
                const range = descriptionEditor.getSelection(true);
                descriptionEditor.insertEmbed(range.index, "image", url);
                descriptionEditor.setSelection(range.index + 1);
              } catch (err) {
                alert(err.message);
              }
            };
            input.click();
          },
        },
      },
    },
  });

  descriptionEditor.root.innerHTML = renderDescriptionHtml(initialHtml);
  return descriptionEditor;
}

function getDescriptionEditorHtml() {
  if (descriptionEditor) {
    const html = descriptionEditor.root.innerHTML.trim();
    if (html === "<p><br></p>" || html === "<p></p>") return "";
    return sanitizeDescriptionHtml(html);
  }
  const fallback = document.getElementById("inspection-description-fallback");
  if (fallback && !fallback.hidden) {
    const text = fallback.value.trim();
    return text ? `<p>${escapeRichTextFallback(text)}</p>` : "";
  }
  return "";
}

function mountDescriptionContent(container, html) {
  container.innerHTML = renderDescriptionHtml(html);
  container.classList.add("rich-content");
}
