// Cliente del asistente de consultas. Manda la pregunta a la función serverless
// (/api/asistente), que devuelve un "spec" (filtro estructurado). El spec se aplica
// localmente sobre los eventos que ya tenemos cargados: los datos nunca salen del navegador.

export async function consultarAsistente(pregunta) {
  const hoy = new Date().toISOString().slice(0, 10);
  let res;
  try {
    res = await fetch("/api/asistente", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pregunta, hoy }),
    });
  } catch {
    return { error: "sin_conexion" };
  }
  if (!res.ok) return { error: "error_servidor" };
  try {
    return await res.json();
  } catch {
    return { error: "respuesta_invalida" };
  }
}
