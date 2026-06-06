import enum


class NovelStatus(str, enum.Enum):
    uploaded = "uploaded"
    preprocessing = "preprocessing"
    ready_for_planning = "ready_for_planning"
    preprocessing_failed = "preprocessing_failed"


class SchemaType(str, enum.Enum):
    ai_video = "ai_video"
    screenwriter = "screenwriter"
    overview = "overview"


class ScreenplayStatus(str, enum.Enum):
    draft = "draft"
    planning = "planning"
    generating = "generating"
    completed = "completed"


class EpisodeStatus(str, enum.Enum):
    pending = "pending"
    generating = "generating"
    done = "done"
    failed = "failed"


class TaskType(str, enum.Enum):
    preprocess = "preprocess"
    generate_episode = "generate_episode"
    generate_screenplay = "generate_screenplay"
    generate_overview = "generate_overview"
    export = "export"


class TaskStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"
    cancelled = "cancelled"


class CharacterRole(str, enum.Enum):
    protagonist = "protagonist"
    supporting = "supporting"
    minor = "minor"


class QualityLevel(str, enum.Enum):
    excellent = "excellent"
    good = "good"
    degraded = "degraded"
    poor = "poor"
    fallback = "fallback"


class ConversationContext(str, enum.Enum):
    preprocessing = "preprocessing"
    planning = "planning"
    generation = "generation"
    conversation = "conversation"


class ConversationStatus(str, enum.Enum):
    active = "active"
    archived = "archived"


class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    tool = "tool"
    system = "system"


class ExportFormat(str, enum.Enum):
    yaml = "yaml"
    pdf = "pdf"
    zip = "zip"


class ExportStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"
