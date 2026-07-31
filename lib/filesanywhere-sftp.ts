import SftpClient from "ssh2-sftp-client"

// SFTP access to FilesAnywhere (connect.filesanywhere.com:22, standard auth).
// The server host key isn't in a known-hosts store, so we accept it (support's
// "accept the security cert" note) — the connection is still encrypted.
export interface SftpConn { host: string; port: number; username: string; password: string }
export interface SftpFile { name: string; modifyTime: number; size: number }

async function withClient<T>(c: SftpConn, fn: (sftp: SftpClient) => Promise<T>): Promise<T> {
  const sftp = new SftpClient()
  await sftp.connect({
    host: c.host,
    port: c.port || 22,
    username: c.username,
    password: c.password,
    readyTimeout: 20_000,
    // Accept the server's host key (no known-hosts file in a serverless env).
    hostVerifier: () => true,
  } as any)
  try {
    return await fn(sftp)
  } finally {
    await sftp.end().catch(() => {})
  }
}

// Files (not directories) in a remote directory.
export async function sftpListFiles(c: SftpConn, dir: string): Promise<SftpFile[]> {
  return withClient(c, async (sftp) => {
    const entries = await sftp.list(dir || "/")
    return entries
      .filter((e) => e.type === "-")
      .map((e) => ({ name: e.name, modifyTime: e.modifyTime, size: e.size }))
  })
}

// Download a file's text content.
export async function sftpDownloadText(c: SftpConn, remotePath: string): Promise<string> {
  return withClient(c, async (sftp) => {
    const buf = (await sftp.get(remotePath)) as Buffer
    return buf.toString("utf8")
  })
}

export function joinRemote(dir: string, name: string): string {
  const d = (dir || "/").replace(/\/+$/, "")
  return `${d}/${name}`
}
