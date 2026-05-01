import { TextEncoder, TextDecoder } from 'util'
import { ReadableStream, WritableStream, TransformStream } from 'stream/web'

const g = global as any

if (typeof g.TextEncoder === 'undefined') g.TextEncoder = TextEncoder
if (typeof g.TextDecoder === 'undefined') g.TextDecoder = TextDecoder
if (typeof g.ReadableStream === 'undefined') g.ReadableStream = ReadableStream
if (typeof g.WritableStream === 'undefined') g.WritableStream = WritableStream
if (typeof g.TransformStream === 'undefined') g.TransformStream = TransformStream
