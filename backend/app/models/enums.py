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
    generate_overview = "generate_overview"
    export = "export"


class TaskStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"
    cancelled = "cancelled"


class ConversationContext(str, enum.Enum):
    preprocessing = "preprocessing"
    planning = "planning"
    generation = "generation"
    conversation = "conversation"


class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    tool = "tool"
    system = "system"


class ExportFormat(str, enum.Enum):
    yaml = "yaml"
    pdf = "pdf"
    zip = "zip"
