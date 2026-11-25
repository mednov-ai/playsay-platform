# Material image uploads

Teachers and administrators can upload JPEG, PNG, WebP and safe SVG images to a
reusable material or append an image page to a supported shared live lesson.
The gateway's authoritative per-image limit is 20 MiB. The lesson upload is
validated before a lesson-specific material is created or updated. Images above
the limit receive the existing `MATERIAL_IMAGE_PAGE_TOO_LARGE` validation
response.

The three upload routes are `POST /api/materials/{materialId}/assets/images`,
`POST /api/materials/{materialId}/image-page` and
`POST /api/schedule/lessons/{lessonId}/image-page`. The web-app nginx, AX41
edge and RF edge each permit a 21 MiB request body for these paths, allowing
space for the multipart envelope. Other API routes keep their own limits. This
allowance does not change authentication, content validation, storage policy
or the gateway's image limit.

Worksheet import accepts supported JPEG, PNG and WebP images up to 20 MiB
each. Its separate packet limit remains 128 MiB of source content, PDFs remain
limited to 64 MiB, and nginx and multipart parsers permit a 129 MiB request
envelope. Photo-based material drafts accept a source image up to 20 MiB,
continue to resize and compress it in the browser, and use a 3 MiB JSON
envelope on the draft endpoint. Pixel, authorization, content, PDF and packet
checks remain in force.

## Classroom display

An uploaded single-image page fills the available task width at its original aspect ratio. A tall worksheet scrolls vertically together with its drawing surface. On desktop, cameras occupy a compact left column. Multiple-page navigation sits below the cameras, and an individual lesson also shows the learner’s lesson vocabulary. The image can still be opened in the existing focused view.

Image-anchored marks and remote pointers use the original raster coordinates on
each participant's screen. A tap paints a dot. If the image moves or resizes
during a stroke, the stroke ends at its last input in the original bounds.
