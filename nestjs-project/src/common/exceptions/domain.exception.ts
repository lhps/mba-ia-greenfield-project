export abstract class DomainException extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class EmailAlreadyExistsException extends DomainException {
  constructor() {
    super('EMAIL_ALREADY_EXISTS', 409, 'Email is already registered');
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('INVALID_CREDENTIALS', 401, 'Invalid email or password');
  }
}

export class EmailNotConfirmedException extends DomainException {
  constructor() {
    super('EMAIL_NOT_CONFIRMED', 403, 'Email address has not been confirmed');
  }
}

export class InvalidTokenException extends DomainException {
  constructor() {
    super('INVALID_TOKEN', 401, 'Token is invalid');
  }
}

export class TokenExpiredException extends DomainException {
  constructor() {
    super('TOKEN_EXPIRED', 401, 'Token has expired');
  }
}

export class TokenReuseDetectedException extends DomainException {
  constructor() {
    super(
      'TOKEN_REUSE_DETECTED',
      401,
      'Token reuse detected — all sessions revoked',
    );
  }
}

export class InvalidUploadRequestException extends DomainException {
  constructor(message: string) {
    super('VALIDATION_ERROR', 400, message);
  }
}

export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video not found');
  }
}

export class VideoAccessDeniedException extends DomainException {
  constructor() {
    super('VIDEO_ACCESS_DENIED', 403, 'You do not own this video');
  }
}

export class UploadNotInProgressException extends DomainException {
  constructor() {
    super(
      'UPLOAD_NOT_IN_PROGRESS',
      409,
      'Upload is not in progress for this video',
    );
  }
}

export class UploadPartsInvalidException extends DomainException {
  constructor() {
    super(
      'UPLOAD_PARTS_INVALID',
      400,
      'Uploaded parts are invalid or incomplete',
    );
  }
}

export class FileTooLargeException extends DomainException {
  constructor() {
    super(
      'FILE_TOO_LARGE',
      413,
      'Uploaded file exceeds the maximum allowed size',
    );
  }
}

export class VideoNotReadyException extends DomainException {
  constructor() {
    super('VIDEO_NOT_READY', 409, 'Video is not ready for playback');
  }
}

export class InvalidCategoryException extends DomainException {
  constructor() {
    super('INVALID_CATEGORY', 400, 'Category does not exist');
  }
}

export class PublishRequirementsNotMetException extends DomainException {
  constructor() {
    super(
      'PUBLISH_REQUIREMENTS_NOT_MET',
      409,
      'Video cannot be published without a category',
    );
  }
}

export class InvalidThumbnailException extends DomainException {
  constructor() {
    super(
      'INVALID_THUMBNAIL',
      400,
      'Thumbnail must be a valid JPEG, PNG or WebP image',
    );
  }
}

export class ThumbnailTooLargeException extends DomainException {
  constructor() {
    super(
      'THUMBNAIL_TOO_LARGE',
      413,
      'Thumbnail exceeds the maximum allowed size',
    );
  }
}

export class ChannelNotFoundException extends DomainException {
  constructor() {
    super('CHANNEL_NOT_FOUND', 404, 'Channel not found');
  }
}

/** Malformed or tampered opaque pagination cursor (TD-09) — a validation error. */
export class InvalidPaginationCursorException extends DomainException {
  constructor() {
    super('VALIDATION_ERROR', 400, 'Pagination cursor is invalid');
  }
}

export class NicknameTakenException extends DomainException {
  constructor() {
    super('NICKNAME_TAKEN', 409, 'Nickname is already in use');
  }
}

export class NicknameReservedException extends DomainException {
  constructor() {
    super('NICKNAME_RESERVED', 409, 'Nickname is reserved');
  }
}

export class NicknameChangeCooldownException extends DomainException {
  constructor() {
    super(
      'NICKNAME_CHANGE_COOLDOWN',
      409,
      'Nickname can be changed once every 14 days',
    );
  }
}
