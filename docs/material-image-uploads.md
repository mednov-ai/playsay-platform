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

## Generating illustrations

The synchronous generation endpoint takes a snapshot of eligible blocks and pairs, then calls the provider and uploads each result under a distinct private storage key outside the database transaction. Publication locks the material, checks current edit permission and matches the whole batch against the latest document. Changes to generation inputs, an ambiguous or missing target, or competing regeneration return `409 MATERIAL_IMAGE_TARGET_CHANGED`. Unrelated edits remain in the returned document. Regeneration preserves the public asset ID, existing references and custom tags.

The additive `material_image_object_cleanup` table records staged keys before upload. Publication releases those keys in the same database transaction as the document update. A recurring collector checks asset and game-blob references before deleting eligible abandoned or superseded objects. Previously published keys have a grace interval for readers. During a writer rollback, finish or reconcile in-flight generation before switching writers.

## Individual desktop lessons

In ordinary view, a dedicated static page with one image or generated image fits
the whole raster beside the remote camera and drawing tools. The available
height accounts for navigation and controls. The camera shows the complete
frame. Image-anchored marks and remote pointers use the original raster
coordinates on each participant's screen. A tap paints a dot. If the drawn
image moves or resizes during a stroke, the stroke ends at its last input in
the original bounds.
