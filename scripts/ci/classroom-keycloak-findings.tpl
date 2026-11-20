{{- range . -}}
{{- $class := .Class -}}
{{- $type := .Type -}}
{{- range .Vulnerabilities -}}
{{printf "%s|%s|%s|%s|%s|%s\n" $class $type .Severity .VulnerabilityID .PkgName .InstalledVersion}}
{{- end -}}
{{- end -}}
