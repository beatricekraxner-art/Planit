param(
    [string]$DataDir
)

$port = 9014
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
$listener.Start()
if ($DataDir) {
    $dir = $DataDir
    if (-not (Test-Path $dir -PathType Container)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $dir = $dir.TrimEnd('\') + '\'
} else {
    $dir = (Resolve-Path .).Path + '\'
}
$logFile = Join-Path $dir 'planit-server.log'
$ErrorActionPreference = 'SilentlyContinue'

function Log($msg) {
    $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $logFile -Value "$t $msg" -Encoding UTF8
}

function GetMime($ext) {
    if ($ext -eq '.html') { return 'text/html; charset=utf-8' }
    elseif ($ext -eq '.css') { return 'text/css; charset=utf-8' }
    elseif ($ext -eq '.js') { return 'application/javascript; charset=utf-8' }
    elseif ($ext -eq '.json') { return 'application/json; charset=utf-8' }
    elseif ($ext -eq '.png') { return 'image/png' }
    elseif ($ext -eq '.jpg') { return 'image/jpeg' }
    elseif ($ext -eq '.svg') { return 'image/svg+xml' }
    elseif ($ext -eq '.ico') { return 'image/x-icon' }
    elseif ($ext -eq '.woff') { return 'font/woff' }
    elseif ($ext -eq '.woff2') { return 'font/woff2' }
    return 'application/octet-stream'
}

function SendBinary($stream, $code, $reason, $type, $body) {
    $ascii = [System.Text.Encoding]::ASCII
    $header = "HTTP/1.1 $code $reason`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nAccess-Control-Allow-Origin: *`r`nCache-Control: no-store, no-cache, must-revalidate, max-age=0`r`nPragma: no-cache`r`nExpires: 0`r`n`r`n"
    $stream.Write($ascii.GetBytes($header), 0, $header.Length)
    $stream.Write($body, 0, $body.Length)
}

function SendText($stream, $code, $reason) {
    $ascii = [System.Text.Encoding]::ASCII
    $body = [System.Text.Encoding]::ASCII.GetBytes($reason)
    $header = "HTTP/1.1 $code $reason`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nAccess-Control-Allow-Origin: *`r`n`r`n"
    $stream.Write($ascii.GetBytes($header), 0, $header.Length)
    $stream.Write($body, 0, $body.Length)
}

Write-Host "Server: http://localhost:$port"
Log("Server started on port $port")

while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
        $stream = $client.GetStream()
        $stream.ReadTimeout = 15000
        $stream.WriteTimeout = 15000
        $ms = New-Object System.IO.MemoryStream
        $buf = New-Object byte[] 8192
        $ascii = [System.Text.Encoding]::ASCII
        $headersDone = $false
        $headerLen = 0
        $method = ''
        $path = ''
        $contentLength = 0
        $gotAnyData = $false
        while (-not $headersDone) {
            $n = $stream.Read($buf, 0, $buf.Length)
            if ($n -le 0) { break }
            $gotAnyData = $true
            $ms.Write($buf, 0, $n)
            $all = $ms.ToArray()
            $idx = -1
            for ($i = 3; $i -lt $all.Length; $i++) {
                if ($all[$i-3] -eq 13 -and $all[$i-2] -eq 10 -and $all[$i-1] -eq 13 -and $all[$i] -eq 10) { $idx = $i + 1; break }
            }
            if ($idx -ge 0) {
                $headersDone = $true
                $headerLen = $idx
                $headerText = $ascii.GetString($all, 0, $idx)
                $headerLines = $headerText -split "`r`n"
                $requestLine = $headerLines[0]
                $method = ($requestLine -split ' ')[0]
                $url = ($requestLine -split ' ')[1]
                $path = $url.Split('?')[0].TrimStart('/')
                if (-not $path) { $path = 'index.html' }
                $contentLength = 0
                foreach ($hl in $headerLines) {
                    if ($hl -match '^(?i)Content-Length:\s*(\d+)$') { $contentLength = [int]$Matches[1] }
                }
                break
            }
            if ($ms.Length -gt 1MB) { break }
        }
        if (-not $headersDone) { throw 'incomplete headers' }
        while ($ms.Length -lt ($headerLen + $contentLength)) {
            $n = $stream.Read($buf, 0, $buf.Length)
            if ($n -le 0) { break }
            $ms.Write($buf, 0, $n)
        }
        $all = $ms.ToArray()
        $bodyBytes = New-Object byte[] $contentLength
        if ($contentLength -gt 0 -and $all.Length -ge ($headerLen + $contentLength)) {
            [Array]::Copy($all, $headerLen, $bodyBytes, 0, $contentLength)
        }

        if ($method -eq 'GET') {
            $filePath = Join-Path $dir $path
            if (-not (Test-Path $filePath -PathType Leaf)) {
                if (-not $path.Contains('.')) { $filePath = Join-Path $dir 'index.html' }
            }
            if (Test-Path $filePath -PathType Leaf) {
                $body = [System.IO.File]::ReadAllBytes($filePath)
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                SendBinary $stream 200 'OK' (GetMime $ext) $body
            } else {
                SendText $stream 404 'Not Found'
                Log("GET $path 404")
            }
        } elseif ($method -eq 'PUT') {
            SendText $stream 404 'Not Found'
            Log("PUT $path 404")
        } elseif ($method -eq 'OPTIONS') {
            $h = "HTTP/1.1 204 No Content`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, PUT, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
            $stream.Write($ascii.GetBytes($h), 0, $h.Length)
        } else {
            SendText $stream 405 'Method Not Allowed'
            Log("$method $path 405")
        }
    } catch {
        if ($gotAnyData) { Log("ERROR $_") }
    } finally {
        try { $stream.Flush() } catch {}
        try { $stream.Close() } catch {}
        try { $client.Close() } catch {}
    }
}
