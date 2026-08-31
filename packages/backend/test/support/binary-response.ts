// supertest/superagent solo trae parsers registrados para unos pocos tipos
// binarios (application/pdf, application/octet-stream, image/*) -- el mime
// type real de un .xlsx (application/vnd.openxmlformats-officedocument.
// spreadsheetml.sheet) no matchea ninguno, así que `response.body` queda
// vacío salvo que se le pase un parser explícito. Este es justo eso: junta
// los chunks crudos en un Buffer, sin intentar interpretarlos.
interface BufferableResponse {
  on(event: 'data' | 'end', listener: (chunk: Buffer) => void): void;
}

export function bufferParser(
  res: BufferableResponse,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}
