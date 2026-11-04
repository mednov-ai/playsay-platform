{{- range . -}}
{{- $class := .Class -}}
{{- range .Vulnerabilities -}}
{{printf "%s|%s|%s|%s\n" $class .VulnerabilityID .PkgName .InstalledVersion}}
{{- end -}}
{{- end -}}
