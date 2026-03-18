import base64
import io
import uuid
from typing import Optional

from app.core.config import settings
from PIL import Image
from supabase import Client, create_client

TAPES_BUCKET = "tapes"


def get_supabase_client() -> Optional[Client]:
    """Get Supabase client if configured."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def upload_headshot(base64_image: str, user_id: int) -> str:
    """
    Upload a headshot image to Supabase Storage.
    
    Args:
        base64_image: Base64 encoded image string (with or without data URL prefix)
        user_id: User ID for organizing files in folders
    
    Returns:
        Public URL of the uploaded image
    
    Raises:
        ValueError: If Supabase is not configured or upload fails
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise ValueError("Supabase storage is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    
    # Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
    if "," in base64_image:
        base64_image = base64_image.split(",")[1]
    
    # Decode base64 to image
    try:
        image_data = base64.b64decode(base64_image)
        image = Image.open(io.BytesIO(image_data))
    except Exception as e:
        raise ValueError(f"Invalid image data: {str(e)}")
    
    # Convert to RGB if necessary (handles RGBA, P, etc.)
    if image.mode in ("RGBA", "P"):
        rgb_image = Image.new("RGB", image.size, (255, 255, 255))
        if image.mode == "RGBA":
            rgb_image.paste(image, mask=image.split()[3])  # Use alpha channel as mask
        else:
            rgb_image.paste(image)
        image = rgb_image
    
    # Convert to JPEG format for consistency
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=85, optimize=True)
    image_bytes = output.getvalue()
    
    # Generate filename
    filename = f"headshot.jpg"
    file_path = f"{user_id}/{filename}"
    
    # Upload to Supabase Storage
    supabase = get_supabase_client()
    if not supabase:
        raise ValueError("Failed to create Supabase client")
    
    try:
        # Upload the file
        response = supabase.storage.from_(settings.supabase_storage_bucket).upload(
            file_path,
            image_bytes,
            file_options={"content-type": "image/jpeg", "upsert": "true"}
        )
        
        # Get public URL
        public_url = supabase.storage.from_(settings.supabase_storage_bucket).get_public_url(file_path)
        
        # Construct full URL if needed
        if not public_url.startswith("http"):
            supabase_url = settings.supabase_url.rstrip("/")
            bucket_name = settings.supabase_storage_bucket
            public_url = f"{supabase_url}/storage/v1/object/public/{bucket_name}/{file_path}"
        
        return public_url
    except Exception as e:
        raise ValueError(f"Failed to upload image to Supabase: {str(e)}")


def delete_headshot(user_id: int) -> bool:
    """
    Delete a user's headshot from Supabase Storage.

    Args:
        user_id: User ID

    Returns:
        True if deleted successfully, False otherwise
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return False

    supabase = get_supabase_client()
    if not supabase:
        return False

    try:
        file_path = f"{user_id}/headshot.jpg"
        supabase.storage.from_(settings.supabase_storage_bucket).remove([file_path])
        return True
    except Exception:
        return False


def upload_founding_actor_headshot(base64_image: str, user_id: int, index: int) -> str:
    """Upload a founding actor headshot to Supabase Storage.

    Stored at ``founding-actors/{user_id}/headshot-{index}.jpg``.
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise ValueError("Supabase storage is not configured")

    if "," in base64_image:
        base64_image = base64_image.split(",")[1]

    try:
        image_data = base64.b64decode(base64_image)
        image = Image.open(io.BytesIO(image_data))
    except Exception as e:
        raise ValueError(f"Invalid image data: {str(e)}")

    if image.mode in ("RGBA", "P"):
        rgb_image = Image.new("RGB", image.size, (255, 255, 255))
        if image.mode == "RGBA":
            rgb_image.paste(image, mask=image.split()[3])
        else:
            rgb_image.paste(image)
        image = rgb_image

    output = io.BytesIO()
    image.save(output, format="JPEG", quality=85, optimize=True)
    image_bytes = output.getvalue()

    file_path = f"founding-actors/{user_id}/headshot-{index}.jpg"

    supabase = get_supabase_client()
    if not supabase:
        raise ValueError("Failed to create Supabase client")

    try:
        supabase.storage.from_(settings.supabase_storage_bucket).upload(
            file_path,
            image_bytes,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )
        public_url = supabase.storage.from_(settings.supabase_storage_bucket).get_public_url(file_path)
        if not public_url.startswith("http"):
            supabase_url = settings.supabase_url.rstrip("/")
            bucket_name = settings.supabase_storage_bucket
            public_url = f"{supabase_url}/storage/v1/object/public/{bucket_name}/{file_path}"
        return public_url
    except Exception as e:
        raise ValueError(f"Failed to upload image to Supabase: {str(e)}")


def delete_founding_actor_headshot(user_id: int, index: int) -> bool:
    """Delete a founding actor headshot from Supabase Storage."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return False

    supabase = get_supabase_client()
    if not supabase:
        return False

    try:
        file_path = f"founding-actors/{user_id}/headshot-{index}.jpg"
        supabase.storage.from_(settings.supabase_storage_bucket).remove([file_path])
        return True
    except Exception:
        return False


def upload_tape(video_bytes: bytes, user_id: int, content_type: str = "video/webm") -> str:
    """
    Upload a self-tape video to Supabase Storage.

    Args:
        video_bytes: Raw video file bytes
        user_id: User ID for organizing files
        content_type: MIME type of the video

    Returns:
        The storage file path (not full URL) for storing in UserTape.file_path

    Raises:
        ValueError: If Supabase is not configured or upload fails
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise ValueError("Supabase storage is not configured")

    ext = "mp4" if "mp4" in content_type else "webm"
    file_path = f"{user_id}/{uuid.uuid4().hex[:12]}.{ext}"

    supabase_client = get_supabase_client()
    if not supabase_client:
        raise ValueError("Failed to create Supabase client")

    try:
        supabase_client.storage.from_(TAPES_BUCKET).upload(
            file_path,
            video_bytes,
            file_options={"content-type": content_type, "upsert": "false"},
        )
        return file_path
    except Exception as e:
        raise ValueError(f"Failed to upload tape: {str(e)}")


def get_tape_public_url(file_path: str) -> str:
    """Get the public URL for a tape file."""
    supabase_client = get_supabase_client()
    if not supabase_client:
        raise ValueError("Failed to create Supabase client")

    public_url = supabase_client.storage.from_(TAPES_BUCKET).get_public_url(file_path)
    if not public_url.startswith("http"):
        supabase_url = settings.supabase_url.rstrip("/")
        public_url = f"{supabase_url}/storage/v1/object/public/{TAPES_BUCKET}/{file_path}"
    return public_url


def delete_tape_file(file_path: str) -> bool:
    """Delete a tape file from Supabase Storage."""
    supabase_client = get_supabase_client()
    if not supabase_client:
        return False
    try:
        supabase_client.storage.from_(TAPES_BUCKET).remove([file_path])
        return True
    except Exception:
        return False

