# MCT Access DB — Full Table Discovery
# Connects via ACE OLEDB 12.0 and dumps every table's schema + sample rows

$accFile = "A:\MTB\MCT-Run.accdb"
$outFile  = "A:\MTB\mct-bms\database\access-schema.json"

$conn = New-Object -ComObject ADODB.Connection
$conn.Open("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$accFile;Persist Security Info=False;")

# Get list of user tables
$schemaRS = $conn.OpenSchema(20)   # adSchemaTables
$tables   = @()
while (-not $schemaRS.EOF) {
    $type = $schemaRS.Fields["TABLE_TYPE"].Value
    $name = $schemaRS.Fields["TABLE_NAME"].Value
    if ($type -eq "TABLE" -and $name -notmatch "^MSys" -and $name -notmatch "^~") {
        $tables += $name
    }
    $schemaRS.MoveNext()
}
$schemaRS.Close()

Write-Host "Found $($tables.Count) user tables: $($tables -join ', ')"

$result = @{}

foreach ($tbl in $tables) {
    Write-Host "Reading [$tbl]..."
    try {
        $rs = New-Object -ComObject ADODB.Recordset
        $rs.Open("SELECT * FROM [$tbl]", $conn, 3, 1)   # adOpenStatic, adLockReadOnly

        # Collect column names
        $cols = @()
        for ($i = 0; $i -lt $rs.Fields.Count; $i++) {
            $f = $rs.Fields.Item($i)
            $cols += @{ name = $f.Name; type = $f.Type; size = $f.DefinedSize }
        }

        # Collect all rows
        $rows = @()
        while (-not $rs.EOF) {
            $row = @{}
            foreach ($col in $cols) {
                $val = $rs.Fields[$col.name].Value
                # Convert COM types to JSON-friendly
                if ($val -is [System.DBNull] -or $val -eq $null) {
                    $row[$col.name] = $null
                } elseif ($val -is [DateTime]) {
                    $row[$col.name] = $val.ToString("yyyy-MM-ddTHH:mm:ss")
                } else {
                    $row[$col.name] = $val
                }
            }
            $rows += $row
            $rs.MoveNext()
        }
        $rs.Close()

        $result[$tbl] = @{
            columns  = $cols
            rowCount = $rows.Count
            rows     = $rows
        }
        Write-Host "  -> $($rows.Count) rows, $($cols.Count) columns"
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)"
        $result[$tbl] = @{ error = $_.Exception.Message }
    }
}

$conn.Close()

# Write JSON output
$json = $result | ConvertTo-Json -Depth 10 -Compress
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.Encoding]::UTF8)
Write-Host "`n✅ Schema + data written to: $outFile"
Write-Host "Total tables exported: $($result.Keys.Count)"
