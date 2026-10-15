function Read-SharedText([string]$Path) {
  $stream = $null
  $reader = $null
  try {
    # Allow replacement where supported and release the handle before parsing.
    # The writer also retries remaining Windows sharing races.
    $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $share)
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $true)
    return $reader.ReadToEnd()
  } finally {
    if ($reader) { $reader.Dispose() }
    elseif ($stream) { $stream.Dispose() }
  }
}
