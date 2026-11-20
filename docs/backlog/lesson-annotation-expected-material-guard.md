# Implemented material guard for lesson annotations

Updated editors send `expectedMaterialId`. Gateway validates it after authorization and serializes the write with lesson and inherited template assignment changes. The conflict response leaves both materials intact. Older clients may continue sending the original content-only request.

The implementation and recovery behavior are described in [lesson text annotations](../lesson-text-annotations.md). `ClassroomMaterialPostgresTest` covers both commit orders for shared, inherited and participant-specific assignment.
