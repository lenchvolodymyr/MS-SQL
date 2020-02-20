const sql = require('mssql');
const { getObjectsFromDatabase, getObjectsFromDatabases, getNewConnectionClientByDb } = require('./helpers');

const getConnectionClient = async connectionInfo => {
	if (connectionInfo.authMethod === 'Username / Password') {
		return await sql.connect({
			user: connectionInfo.userName,
			password: connectionInfo.userPassword,
			server: connectionInfo.host,
			port: connectionInfo.port,
			database: connectionInfo.databaseName,
			options: {
				encrypt: true,
			},
		});
	}

	return await sql.connect(connectionInfo.connectionString);
};

const getTableInfo = async (connectionClient, dbName, tableName) => {
	const currentDbConnectionClient = await getNewConnectionClientByDb(connectionClient, dbName);
	return await currentDbConnectionClient.query`
		SELECT c.*, t.table_name as RELATED_TABLE, k.column_name as PRIMARY_KEY_COLUMN
		FROM information_schema.columns as c
		LEFT JOIN INFORMATION_SCHEMA.VIEW_TABLE_USAGE t ON t.view_name=c.table_name
		LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc ON tc.TABLE_NAME=c.TABLE_NAME AND tc.constraint_type='PRIMARY KEY'
		LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k ON k.CONSTRAINT_NAME=tc.CONSTRAINT_NAME
		where c.table_name = ${tableName}
	;`
};

const getTableRow = async (connectionClient, dbName, tableName) => {
	const currentDbConnectionClient = await getNewConnectionClientByDb(connectionClient, dbName);
	return await currentDbConnectionClient
		.request()
		.input('tableName', sql.VarChar, tableName)
		.query`EXEC('SELECT TOP 1 * FROM [' + @TableName + '];');`;
};

const getTableForeignKeys = async (connectionClient, dbName) => {
	const currentDbConnectionClient = await getNewConnectionClientByDb(connectionClient, dbName);
	return await currentDbConnectionClient
		.query`
		SELECT obj.name AS FK_NAME,
				sch.name AS [schema_name],
				tab1.name AS [table],
				col1.name AS [column],
				tab2.name AS [referenced_table],
				col2.name AS [referenced_column]
		FROM sys.foreign_key_columns fkc
		INNER JOIN sys.objects obj
			ON obj.object_id = fkc.constraint_object_id
		INNER JOIN sys.tables tab1
			ON tab1.object_id = fkc.parent_object_id
		INNER JOIN sys.schemas sch
			ON tab1.schema_id = sch.schema_id
		INNER JOIN sys.columns col1
			ON col1.column_id = parent_column_id AND col1.object_id = tab1.object_id
		INNER JOIN sys.tables tab2
			ON tab2.object_id = fkc.referenced_object_id
		INNER JOIN sys.columns col2
			ON col2.column_id = referenced_column_id AND col2.object_id = tab2.object_id
		`
};

const getDatabaseIndexes = async (connectionClient, dbName) => {
	const currentDbConnectionClient = await getNewConnectionClientByDb(connectionClient, dbName);
	return await currentDbConnectionClient
		.query`
		SELECT
			TableName = t.name,
			IndexName = ind.name,
			IndexId = ind.index_id,
			ColumnId = ic.index_column_id,
			ColumnName = col.name,
			ind.*,
			ic.*,
			col.* 
		FROM sys.indexes ind
		INNER JOIN
			sys.index_columns ic ON  ind.object_id = ic.object_id and ind.index_id = ic.index_id 
		INNER JOIN
			sys.columns col ON ic.object_id = col.object_id and ic.column_id = col.column_id 
		INNER JOIN
			sys.tables t ON ind.object_id = t.object_id 
		WHERE
			ind.is_primary_key = 0 
			AND ind.is_unique = 0 
			AND ind.is_unique_constraint = 0 
			AND t.is_ms_shipped = 0 
		ORDER BY
			t.name, ind.name, ind.index_id, ic.index_column_id;
		`;
};

const getObjects = async (client) => client.config.database
	? await getObjectsFromDatabase(client)
	: await getObjectsFromDatabases(client);

module.exports = {
	getConnectionClient,
	getObjects,
	getTableInfo,
	getTableRow,
	getTableForeignKeys,
	getDatabaseIndexes,
}