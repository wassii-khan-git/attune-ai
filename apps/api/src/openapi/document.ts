import {
  apiErrorSchema,
  AUDIO_FIELD_NAME,
  authResponseSchema,
  createVisitRequestSchema,
  listVisitsQuerySchema,
  listVisitsResponseSchema,
  livenessResponseSchema,
  loginRequestSchema,
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SEC,
  meResponseSchema,
  processEventSchema,
  readinessResponseSchema,
  refreshRequestSchema,
  registerRequestSchema,
  sessionResponseSchema,
  updateNoteRequestSchema,
  visitDetailResponseSchema,
  visitIdParamsSchema,
  visitResponseSchema,
} from '@attune/shared';
import { z } from 'zod';

type JsonSchema = Record<string, unknown>;
type Method = 'get' | 'post' | 'put' | 'delete';

type ResponseSpec = {
  description: string;
  schema?: z.ZodType;
  contentType?: string;
};

/** One endpoint, described with the same Zod schemas the handlers validate with. */
export type Operation = {
  method: Method;
  /** OpenAPI form, for example `/v1/visits/{id}`. */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  /** Whether a session is required. */
  auth: boolean;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  /** Set for the one endpoint that takes a file instead of JSON. */
  multipartBody?: JsonSchema;
  responses: Record<number, ResponseSpec>;
  /** Error statuses this endpoint can answer with, beyond the ones every endpoint shares. */
  errors?: number[];
};

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'The request is malformed or failed validation.',
  401: 'No valid session.',
  403: 'The request is not allowed.',
  404: 'The resource does not exist, or belongs to someone else.',
  409: 'The resource is in a state that does not allow this, or a limit has been reached.',
  413: 'The body is too large.',
  415: 'The upload is not a supported audio recording.',
  429: 'Too many requests, or the daily quota is used up.',
};

/** JSON Schema for a request (`input`) or a response (`output`). */
function toSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, { io });
  return jsonSchema;
}

function toParameters(schema: z.ZodObject, location: 'path' | 'query'): JsonSchema[] {
  const { properties = {}, required = [] } = toSchema(schema, 'output') as {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  return Object.entries(properties).map(([name, property]) => {
    const { description, ...parameterSchema } = property;
    return {
      name,
      in: location,
      // A query parameter with a default is optional for the caller.
      required: location === 'path' || (required.includes(name) && !('default' in property)),
      ...(typeof description === 'string' ? { description } : {}),
      schema: parameterSchema,
    };
  });
}

const errorResponse = (description: string): JsonSchema => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
});

export const OPERATIONS: Operation[] = [
  {
    method: 'get',
    path: '/health',
    tag: 'Health',
    summary: 'Liveness: the process is up',
    auth: false,
    responses: { 200: { description: 'The API is running.', schema: livenessResponseSchema } },
  },
  {
    method: 'get',
    path: '/ready',
    tag: 'Health',
    summary: 'Readiness: dependencies are reachable',
    auth: false,
    responses: {
      200: { description: 'Every dependency answered.', schema: readinessResponseSchema },
      503: { description: 'At least one dependency is down.', schema: readinessResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/v1/auth/register',
    tag: 'Auth',
    summary: 'Create an account and start a session',
    description:
      'Browsers receive the session as httpOnly cookies. Native clients send `X-Token-Transport: body` and receive the tokens in the response.',
    auth: false,
    body: registerRequestSchema,
    responses: { 201: { description: 'Account created.', schema: authResponseSchema } },
    errors: [400, 409, 429],
  },
  {
    method: 'post',
    path: '/v1/auth/login',
    tag: 'Auth',
    summary: 'Start a session with email and password',
    auth: false,
    body: loginRequestSchema,
    responses: { 200: { description: 'Signed in.', schema: authResponseSchema } },
    errors: [400, 401, 429],
  },
  {
    method: 'post',
    path: '/v1/auth/guest',
    tag: 'Auth',
    summary: 'Start a temporary guest session',
    description: 'A guest account and everything it creates are deleted after 24 hours.',
    auth: false,
    responses: { 201: { description: 'Guest session started.', schema: authResponseSchema } },
    errors: [429],
  },
  {
    method: 'post',
    path: '/v1/auth/refresh',
    tag: 'Auth',
    summary: 'Exchange a refresh token for a new session',
    description:
      'The refresh token is single use. Replaying one that was already exchanged ends every session of that user.',
    auth: false,
    body: refreshRequestSchema,
    responses: { 200: { description: 'Session renewed.', schema: authResponseSchema } },
    errors: [400, 401, 429],
  },
  {
    method: 'post',
    path: '/v1/auth/logout',
    tag: 'Auth',
    summary: 'End the session',
    auth: false,
    body: refreshRequestSchema,
    responses: { 204: { description: 'Signed out. Also returned when there was no session.' } },
    errors: [400, 429],
  },
  {
    method: 'get',
    path: '/v1/auth/me',
    tag: 'Auth',
    summary: 'The signed-in user',
    auth: true,
    responses: { 200: { description: 'The caller.', schema: meResponseSchema } },
  },
  {
    method: 'get',
    path: '/v1/auth/session',
    tag: 'Auth',
    summary: 'Whether anyone is signed in',
    description:
      'Always answers 200. `user` is null when nobody is signed in; `canRefresh` then says whether a refresh token is present.',
    auth: false,
    responses: {
      200: { description: 'The current session, if any.', schema: sessionResponseSchema },
    },
  },
  {
    method: 'post',
    path: '/v1/visits',
    tag: 'Visits',
    summary: 'Create a visit',
    auth: true,
    description: 'An account holds a limited number of visits; at the limit this answers 409.',
    body: createVisitRequestSchema,
    responses: { 201: { description: 'Visit created.', schema: visitResponseSchema } },
    errors: [400, 409, 429],
  },
  {
    method: 'get',
    path: '/v1/visits',
    tag: 'Visits',
    summary: "List the caller's visits, newest first",
    description: 'Returns summaries only. No transcript or note is decrypted for a list.',
    auth: true,
    query: listVisitsQuerySchema,
    responses: { 200: { description: 'One page of visits.', schema: listVisitsResponseSchema } },
    errors: [400],
  },
  {
    method: 'get',
    path: '/v1/visits/{id}',
    tag: 'Visits',
    summary: 'Get a visit with its transcript and note',
    description: 'Decrypts the clinical content and records the view in the audit log.',
    auth: true,
    params: visitIdParamsSchema,
    responses: { 200: { description: 'The visit.', schema: visitDetailResponseSchema } },
    errors: [400, 404],
  },
  {
    method: 'put',
    path: '/v1/visits/{id}/note',
    tag: 'Visits',
    summary: 'Replace the note',
    description: 'The body is the whole note, so a save can be retried safely.',
    auth: true,
    params: visitIdParamsSchema,
    body: updateNoteRequestSchema,
    responses: { 200: { description: 'Note saved.', schema: visitResponseSchema } },
    errors: [400, 404, 409, 429],
  },
  {
    method: 'delete',
    path: '/v1/visits/{id}',
    tag: 'Visits',
    summary: 'Delete a visit',
    auth: true,
    params: visitIdParamsSchema,
    responses: { 204: { description: 'Deleted. Also returned when it was already gone.' } },
    errors: [400, 429],
  },
  {
    method: 'post',
    path: '/v1/visits/{id}/process',
    tag: 'Visits',
    summary: 'Upload a recording and stream the transcript and note',
    description: [
      `Takes one audio file of at most ${String(MAX_AUDIO_BYTES / 1024 / 1024)} MB. The recording is held in memory for this request and never stored.`,
      `Recordings are meant to be at most ${String(MAX_RECORDING_SEC / 60)} minutes. The length is reported by the client in \`durationSec\`; the limit the server enforces itself is the file size.`,
      'If the visit already has a note, the request is refused with `NOTE_EXISTS` unless `replaceExisting` is `true`, so an edited note is never overwritten by accident.',
      'The response is newline-delimited JSON: one event per line, ending with exactly one `done` or `error` event. Once the stream has started the status stays 200, so read the last event to know the outcome.',
      'Blank lines can appear between events. They only keep the connection open while the model is working: skip them.',
    ].join('\n\n'),
    auth: true,
    params: visitIdParamsSchema,
    multipartBody: {
      type: 'object',
      required: [AUDIO_FIELD_NAME, 'durationSec'],
      properties: {
        [AUDIO_FIELD_NAME]: { type: 'string', format: 'binary', description: 'The recording.' },
        durationSec: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_RECORDING_SEC,
          description: 'Length of the recording as measured by the client.',
        },
        replaceExisting: {
          type: 'boolean',
          default: false,
          description: 'Confirms that an existing note may be replaced.',
        },
      },
    },
    responses: {
      200: {
        description: 'A stream of events, one JSON object per line.',
        schema: processEventSchema,
        contentType: 'application/x-ndjson',
      },
    },
    errors: [400, 403, 404, 409, 413, 415, 429],
  },
  {
    method: 'delete',
    path: '/v1/account',
    tag: 'Account',
    summary: 'Delete the account and everything in it',
    auth: true,
    responses: { 204: { description: 'Account, visits and sessions deleted.' } },
  },
];

function toOperationObject(operation: Operation): JsonSchema {
  const parameters = [
    ...(operation.params === undefined ? [] : toParameters(operation.params, 'path')),
    ...(operation.query === undefined ? [] : toParameters(operation.query, 'query')),
  ];

  const requestBody =
    operation.multipartBody !== undefined
      ? { required: true, content: { 'multipart/form-data': { schema: operation.multipartBody } } }
      : operation.body !== undefined
        ? {
            required: true,
            content: { 'application/json': { schema: toSchema(operation.body, 'input') } },
          }
        : undefined;

  const errorStatuses = [...(operation.errors ?? []), ...(operation.auth ? [401] : [])];

  return {
    tags: [operation.tag],
    summary: operation.summary,
    ...(operation.description === undefined ? {} : { description: operation.description }),
    ...(parameters.length === 0 ? {} : { parameters }),
    ...(requestBody === undefined ? {} : { requestBody }),
    security: operation.auth ? [{ bearerAuth: [] }, { cookieAuth: [] }] : [],
    responses: Object.fromEntries([
      ...Object.entries(operation.responses).map(([status, response]) => [
        status,
        {
          description: response.description,
          ...(response.schema === undefined
            ? {}
            : {
                content: {
                  [response.contentType ?? 'application/json']: {
                    schema: toSchema(response.schema, 'output'),
                  },
                },
              }),
        },
      ]),
      ...[...new Set(errorStatuses)]
        .sort((a, b) => a - b)
        .map((status) => [String(status), errorResponse(ERROR_DESCRIPTIONS[status] ?? 'Error.')]),
    ]),
  };
}

/**
 * The OpenAPI 3.1 description of the public API. Request and response shapes
 * come from the shared Zod schemas, so the document cannot describe a field
 * the handlers do not validate.
 */
export function buildOpenApiDocument(): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {};
  for (const operation of OPERATIONS) {
    (paths[operation.path] ??= {})[operation.method] = toOperationObject(operation);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Attune AI API',
      version: '1.0.0',
      description: [
        'An AI clinical scribe demo: record a short consultation, get a transcript and an editable SOAP note.',
        'Demo only, for synthetic data. Built with HIPAA-style safeguards; not a medical device.',
      ].join('\n\n'),
    },
    tags: [{ name: 'Health' }, { name: 'Auth' }, { name: 'Visits' }, { name: 'Account' }],
    paths,
    components: {
      schemas: { ApiError: toSchema(apiErrorSchema, 'output') },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'For native clients: the access token from a sign-in response.',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'attune_access',
          description: 'For browsers: set as an httpOnly cookie by the sign-in endpoints.',
        },
      },
    },
  };
}
