const DEFAULT_GRPC_ENDPOINT = '/domainsearch.v1.DomainSearchService/CheckPriceAgent';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();
const asciiDecoder = new TextDecoder('ascii');

const WIRE_TYPE = {
  VARINT: 0,
  LENGTH_DELIMITED: 2,
  FIXED32: 5,
  FIXED64: 1
};

const encodeVarint = (value) => {
  const bytes = [];
  let v = Math.floor(Math.max(0, Number(value)));
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  bytes.push(v);
  return Uint8Array.from(bytes);
};

const decodeVarint = (buffer, offset) => {
  let result = 0;
  let shift = 0;
  let position = offset;
  while (position < buffer.length) {
    const byte = buffer[position++];
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) {
      return { value: result, nextOffset: position };
    }
    shift += 7;
  }
  throw new Error('Malformed varint');
};

const concatBuffers = (a, b) => {
  if (!a || a.length === 0) {
    return b ? new Uint8Array(b) : new Uint8Array(0);
  }
  if (!b || b.length === 0) {
    return new Uint8Array(a);
  }
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
};

const concatChunks = (chunks) => {
  const filtered = chunks.filter((chunk) => chunk && chunk.length);
  if (!filtered.length) {
    return new Uint8Array(0);
  }
  return filtered.reduce((acc, chunk) => concatBuffers(acc, chunk), new Uint8Array(0));
};

const encodeTag = (fieldNumber, wireType) => encodeVarint((fieldNumber << 3) | wireType);

const encodeLengthPrefixed = (bytes) => concatBuffers(encodeVarint(bytes.length), bytes);

const encodeStringField = (fieldNumber, value) => {
  if (!value) {
    return new Uint8Array(0);
  }
  const payload = utf8Encoder.encode(value);
  return concatChunks([encodeTag(fieldNumber, WIRE_TYPE.LENGTH_DELIMITED), encodeVarint(payload.length), payload]);
};

const encodeMessageField = (fieldNumber, bytes) => {
  if (!bytes || !bytes.length) {
    return new Uint8Array(0);
  }
  return concatChunks([encodeTag(fieldNumber, WIRE_TYPE.LENGTH_DELIMITED), encodeVarint(bytes.length), bytes]);
};

const encodeUInt32Wrapper = (value) => concatChunks([
  encodeTag(1, WIRE_TYPE.VARINT),
  encodeVarint(value)
]);

const encodeDomainPriceFilter = (filter = {}) => {
  const chunks = [];
  if (typeof filter.quantity === 'number' && Number.isFinite(filter.quantity) && filter.quantity > 0) {
    const wrapper = encodeUInt32Wrapper(filter.quantity);
    chunks.push(encodeMessageField(1, wrapper));
  }
  if (filter.includedTldNames) {
    chunks.push(encodeStringField(3, filter.includedTldNames));
  } else if (filter.excludedTldNames) {
    chunks.push(encodeStringField(2, filter.excludedTldNames));
  }
  return concatChunks(chunks);
};

const encodePriceFilter = (filter = {}) => {
  if (!filter.domain) {
    return new Uint8Array(0);
  }
  const domainBytes = encodeDomainPriceFilter(filter.domain);
  return encodeMessageField(1, domainBytes);
};

const encodeSearchPricesRequest = (payload) => {
  const chunks = [];
  if (payload.product) {
    chunks.push(encodeStringField(1, payload.product));
  }
  if (payload.query) {
    chunks.push(encodeStringField(2, payload.query));
  }
  if (payload.currencyCode) {
    chunks.push(encodeStringField(3, payload.currencyCode));
  }
  if (payload.filter) {
    const filterBytes = encodePriceFilter(payload.filter);
    if (filterBytes.length) {
      chunks.push(encodeMessageField(4, filterBytes));
    }
  }
  return concatChunks(chunks);
};

const frameGrpcMessage = (messageBytes) => {
  const frame = new Uint8Array(5 + messageBytes.length);
  frame[0] = 0x0;
  const view = new DataView(frame.buffer);
  view.setUint32(1, messageBytes.length, false);
  frame.set(messageBytes, 5);
  return frame;
};

const skipField = (wireType, buffer, offset) => {
  switch (wireType) {
    case WIRE_TYPE.VARINT: {
      return decodeVarint(buffer, offset).nextOffset;
    }
    case WIRE_TYPE.FIXED64:
      return offset + 8;
    case WIRE_TYPE.LENGTH_DELIMITED: {
      const { value: length, nextOffset } = decodeVarint(buffer, offset);
      return nextOffset + length;
    }
    case WIRE_TYPE.FIXED32:
      return offset + 4;
    default:
      throw new Error(`Unsupported wire type ${wireType}`);
  }
};

const readFixed32 = (buffer, offset, littleEndian = true) => {
  const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
  const value = view.getFloat32(0, littleEndian);
  return { value, nextOffset: offset + 4 };
};

const readFixed64 = (buffer, offset, littleEndian = true) => {
  const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
  const value = view.getFloat64(0, littleEndian);
  return { value, nextOffset: offset + 8 };
};

const readBytes = (buffer, offset) => {
  const { value: length, nextOffset } = decodeVarint(buffer, offset);
  const end = nextOffset + length;
  return { value: buffer.slice(nextOffset, end), nextOffset: end };
};

const readString = (buffer, offset) => {
  const { value: length, nextOffset } = decodeVarint(buffer, offset);
  const end = nextOffset + length;
  return { value: utf8Decoder.decode(buffer.slice(nextOffset, end)), nextOffset: end };
};

const decodeTimestamp = (buffer) => {
  let offset = 0;
  let seconds = 0;
  let nanos = 0;
  while (offset < buffer.length) {
    const { value: tag, nextOffset } = decodeVarint(buffer, offset);
    offset = nextOffset;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if (fieldNumber === 1 && wireType === WIRE_TYPE.VARINT) {
      const { value, nextOffset: after } = decodeVarint(buffer, offset);
      seconds = value;
      offset = after;
    } else if (fieldNumber === 2 && wireType === WIRE_TYPE.VARINT) {
      const { value, nextOffset: after } = decodeVarint(buffer, offset);
      nanos = value;
      offset = after;
    } else {
      offset = skipField(wireType, buffer, offset);
    }
  }
  const millis = seconds * 1000 + Math.round((nanos || 0) / 1e6);
  if (!Number.isFinite(millis)) {
    return null;
  }
  return new Date(millis).toISOString();
};

const decodePromotionPeriod = (buffer) => {
  let offset = 0;
  const period = {};
  while (offset < buffer.length) {
    const { value: tag, nextOffset } = decodeVarint(buffer, offset);
    offset = nextOffset;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if ((fieldNumber === 1 || fieldNumber === 2) && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value: tsBytes, nextOffset: afterTs } = readBytes(buffer, offset);
      const iso = decodeTimestamp(tsBytes);
      if (fieldNumber === 1) {
        period.from = iso;
      } else {
        period.to = iso;
      }
      offset = afterTs;
    } else {
      offset = skipField(wireType, buffer, offset);
    }
  }
  return period;
};

const decodePromotion = (buffer) => {
  let offset = 0;
  const promotion = {};
  while (offset < buffer.length) {
    const { value: tag, nextOffset } = decodeVarint(buffer, offset);
    offset = nextOffset;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if (fieldNumber === 1 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value: periodBytes, nextOffset: afterPeriod } = readBytes(buffer, offset);
      promotion.period = decodePromotionPeriod(periodBytes);
      offset = afterPeriod;
    } else {
      offset = skipField(wireType, buffer, offset);
    }
  }
  return promotion;
};

const decodePrice = (buffer) => {
  let offset = 0;
  const price = {};
  while (offset < buffer.length) {
    const { value: tag, nextOffset } = decodeVarint(buffer, offset);
    offset = nextOffset;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if (fieldNumber === 1 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value, nextOffset: after } = readString(buffer, offset);
      price.currencyCode = value;
      offset = after;
    } else if ((fieldNumber === 2 || fieldNumber === 3) && wireType === WIRE_TYPE.VARINT) {
      const { value, nextOffset: after } = decodeVarint(buffer, offset);
      if (fieldNumber === 2) {
        price.units = value;
      } else {
        price.nanos = value;
      }
      offset = after;
    } else if (fieldNumber === 4 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value, nextOffset: after } = readString(buffer, offset);
      price.value = value;
      offset = after;
    } else {
      offset = skipField(wireType, buffer, offset);
    }
  }
  return price;
};

const decodeProductPrice = (buffer) => {
  let offset = 0;
  const productPrice = { labels: [] };
  while (offset < buffer.length) {
    const { value: tag, nextOffset } = decodeVarint(buffer, offset);
    offset = nextOffset;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if (fieldNumber === 1 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value: priceBytes, nextOffset: afterPrice } = readBytes(buffer, offset);
      productPrice.price = decodePrice(priceBytes);
      offset = afterPrice;
    } else if (fieldNumber === 2 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value: promotionBytes, nextOffset: afterPromotion } = readBytes(buffer, offset);
      productPrice.promotion = decodePromotion(promotionBytes);
      offset = afterPromotion;
    } else if (fieldNumber === 3 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value, nextOffset: after } = readString(buffer, offset);
      productPrice.labels.push(value);
      offset = after;
    } else {
      offset = skipField(wireType, buffer, offset);
    }
  }
  return productPrice;
};

const decodePriceEntry = (buffer) => {
  let offset = 0;
  let key = '';
  let value = null;
  while (offset < buffer.length) {
    const { value: tag, nextOffset } = decodeVarint(buffer, offset);
    offset = nextOffset;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if (fieldNumber === 1 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value, nextOffset: after } = readString(buffer, offset);
      key = value;
      offset = after;
    } else if (fieldNumber === 2 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value: priceBytes, nextOffset: afterPrice } = readBytes(buffer, offset);
      value = decodeProductPrice(priceBytes);
      offset = afterPrice;
    } else {
      offset = skipField(wireType, buffer, offset);
    }
  }
  return { key, value };
};

const decodePricePayload = (buffer) => {
  let offset = 0;
  const price = {
    promotion: false,
    cost: 0,
    currency: '',
    domain: '',
    labels: [],
    availability: false,
    similarityScore: 0,
    renewalCost: 0
  };
  while (offset < buffer.length) {
    const { value: tag, nextOffset } = decodeVarint(buffer, offset);
    offset = nextOffset;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if (fieldNumber === 1 && wireType === WIRE_TYPE.VARINT) {
      const { value, nextOffset: after } = decodeVarint(buffer, offset);
      price.promotion = Boolean(value);
      offset = after;
    } else if (fieldNumber === 2 && wireType === WIRE_TYPE.FIXED32) {
      const { value, nextOffset: after } = readFixed32(buffer, offset, true);
      price.cost = value;
      offset = after;
    } else if (fieldNumber === 3 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value, nextOffset: after } = readString(buffer, offset);
      price.currency = value;
      offset = after;
    } else if (fieldNumber === 4 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value, nextOffset: after } = readString(buffer, offset);
      price.domain = value;
      offset = after;
    } else if (fieldNumber === 5 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value, nextOffset: after } = readString(buffer, offset);
      price.labels.push(value);
      offset = after;
    } else if (fieldNumber === 6 && wireType === WIRE_TYPE.VARINT) {
      const { value, nextOffset: after } = decodeVarint(buffer, offset);
      price.availability = Boolean(value);
      offset = after;
    } else if (fieldNumber === 7 && wireType === WIRE_TYPE.FIXED64) {
      const { value, nextOffset: after } = readFixed64(buffer, offset, true);
      price.similarityScore = value;
      offset = after;
    } else if (fieldNumber === 8 && wireType === WIRE_TYPE.FIXED32) {
      const { value, nextOffset: after } = readFixed32(buffer, offset, true);
      price.renewalCost = value;
      offset = after;
    } else {
      offset = skipField(wireType, buffer, offset);
    }
  }
  return price;
};

const decodeStatus = (buffer) => {
  let offset = 0;
  const status = { code: 0, message: '', details: [] };
  while (offset < buffer.length) {
    const { value: tag, nextOffset } = decodeVarint(buffer, offset);
    offset = nextOffset;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if (fieldNumber === 1 && wireType === WIRE_TYPE.VARINT) {
      const { value, nextOffset: after } = decodeVarint(buffer, offset);
      status.code = value;
      offset = after;
    } else if (fieldNumber === 2 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value, nextOffset: after } = readString(buffer, offset);
      status.message = value;
      offset = after;
    } else if (fieldNumber === 3 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value: anyBytes, nextOffset: after } = readBytes(buffer, offset);
      status.details.push(anyBytes);
      offset = after;
    } else {
      offset = skipField(wireType, buffer, offset);
    }
  }
  return status;
};

const decodeSearchPricesResponse = (buffer) => {
  let offset = 0;
  const response = { price: null, error: null };
  while (offset < buffer.length) {
    const { value: tag, nextOffset } = decodeVarint(buffer, offset);
    offset = nextOffset;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if (fieldNumber === 1 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value: priceBytes, nextOffset: afterPrice } = readBytes(buffer, offset);
      response.price = decodePricePayload(priceBytes);
      offset = afterPrice;
    } else if (fieldNumber === 2 && wireType === WIRE_TYPE.LENGTH_DELIMITED) {
      const { value: statusBytes, nextOffset: afterStatus } = readBytes(buffer, offset);
      response.error = decodeStatus(statusBytes);
      offset = afterStatus;
    } else {
      offset = skipField(wireType, buffer, offset);
    }
  }
  return response;
};

const parseTrailers = (buffer) => {
  const text = asciiDecoder.decode(buffer);
  return text
    .trim()
    .split('\r\n')
    .filter(Boolean)
    .reduce((acc, line) => {
      const [rawKey, ...rest] = line.split(':');
      if (!rawKey) {
        return acc;
      }
      const key = rawKey.trim().toLowerCase();
      acc[key] = rest.join(':').trim();
      return acc;
    }, {});
};

export async function* streamSearchPrices(request, signal, endpoint = DEFAULT_GRPC_ENDPOINT) {
  const messageBytes = encodeSearchPricesRequest(request);
  const body = frameGrpcMessage(messageBytes);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/grpc-web+proto',
      'X-Grpc-Web': '1',
      'X-User-Agent': 'domain-search-ui',
      Accept: 'application/grpc-web+proto'
    },
    body,
    signal
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(text || 'Failed to connect to the gRPC service.');
  }

  const reader = response.body.getReader();
  let buffer = new Uint8Array(0);

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        buffer = concatBuffers(buffer, value);
      }

      while (buffer.length >= 5) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const frameType = buffer[0];
        const messageLength = view.getUint32(1, false);
        if (buffer.length < 5 + messageLength) {
          break;
        }

        const message = buffer.slice(5, 5 + messageLength);
        buffer = buffer.slice(5 + messageLength);

        if (frameType === 0x80) {
          const trailers = parseTrailers(message);
          const status = Number(trailers['grpc-status'] ?? 0);
          if (status !== 0) {
            throw new Error(trailers['grpc-message'] || `gRPC status ${status}`);
          }
          return;
        }

        yield decodeSearchPricesResponse(message);
      }
    }
    const headerStatus = Number(response.headers.get('grpc-status') ?? 0);
    if (headerStatus !== 0) {
      const headerMessage = response.headers.get('grpc-message') || '';
      throw new Error(headerMessage || `gRPC status ${headerStatus}`);
    }
    return;
  } finally {
    reader.releaseLock();
  }
}

export { DEFAULT_GRPC_ENDPOINT };
