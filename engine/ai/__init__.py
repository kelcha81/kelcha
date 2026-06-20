"""AI strategy authoring: validate, sandbox-run, and generate ICT strategies.

Generation calls Claude (``ai.client``); everything that *executes* generated code
goes through ``ai.validator`` (AST allowlist) then ``ai.sandbox`` (subprocess +
timeout). Nothing here runs untrusted code in-process.
"""
