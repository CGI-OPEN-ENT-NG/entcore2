package org.entcore.common.explorer.impl;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.Tuple;
import org.entcore.common.explorer.ExplorerStream;
import org.entcore.common.explorer.IExplorerPluginCommunication;
import org.entcore.common.explorer.IngestJobState;
import org.entcore.common.explorer.IngestJobStateUpdateMessage;
import org.entcore.common.postgres.IPostgresClient;
import org.entcore.common.postgres.PostgresClient;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.user.UserInfos;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

import static java.lang.Long.parseLong;

public abstract class ExplorerPluginResourceSql extends ExplorerPluginResource {
    protected final IPostgresClient pgPool;
    protected List<String> defaultColumns = Arrays.asList("version", "ingest_job_state");

    protected ExplorerPluginResourceSql(final IExplorerPluginCommunication communication, final IPostgresClient pool) {
        super(communication);
        this.pgPool = pool;
    }

    @Override
    protected String getIdForModel(final JsonObject json) {
        return json.getValue(getIdColumn()).toString();
    }

    @Override
    protected JsonObject setIdForModel(final JsonObject json, final String id) {
        json.put(getIdColumn(), Integer.valueOf(id));
        return json;
    }

    @Override
    protected UserInfos getCreatorForModel(final JsonObject json) { final String id = json.getString(getCreatorIdColumn());
        final String name = json.getString(getCreatorNameColumn());
        final UserInfos user = new UserInfos();
        user.setUserId(id);
        user.setUsername(name);
        return user;
    }

    @Override
    protected void doFetchForIndex(final ExplorerStream<JsonObject> stream, final Optional<Date> from, final Optional<Date> to) {
        final Tuple tuple = Tuple.tuple();
        final StringBuilder query = new StringBuilder();
        if(getShareTableName().isPresent()){
            final String schema = getTableName().split("\\.")[0];
            final String shareTable = getShareTableName().get();
            query.append(" SELECT t.*, ");
            query.append(String.format(" JSON_AGG(ROW_TO_JSON(ROW(member_id,action)::%s.share_tuple)) AS shared, ", schema));
            query.append(" ARRAY_TO_JSON(ARRAY_AGG(group_id)) AS groups ");
            query.append(String.format(" FROM %s AS t ", getTableName()));
            query.append(String.format(" LEFT JOIN %s s ON t.id = s.resource_id ", shareTable));
            query.append(String.format(" LEFT JOIN %s.members ON (member_id = %s.members.id AND group_id IS NOT NULL) ",schema, schema));
        }else{
            query.append(String.format("SELECT * FROM %s ", getTableName()));
        }
        if (from.isPresent() && to.isPresent()) {
            final LocalDateTime localFrom = Instant.ofEpochMilli(from.get().getTime())
                    .atZone(ZoneId.systemDefault())
                    .toLocalDateTime();
            final LocalDateTime localTo = Instant.ofEpochMilli(to.get().getTime())
                    .atZone(ZoneId.systemDefault())
                    .toLocalDateTime();
            tuple.addValue(localFrom);
            tuple.addValue(localTo);
            query.append(String.format("WHERE %s >= $1 AND %s < $2 ",getCreatedAtColumn(),getCreatedAtColumn()));
        } else if (from.isPresent()) {
            final LocalDateTime localFrom = Instant.ofEpochMilli(from.get().getTime())
                    .atZone(ZoneId.systemDefault())
                    .toLocalDateTime();
            tuple.addValue(localFrom);
            query.append(String.format("WHERE %s >= $1 ",getCreatedAtColumn()));
        } else if (to.isPresent()) {
            final LocalDateTime localTo = Instant.ofEpochMilli(to.get().getTime())
                    .atZone(ZoneId.systemDefault())
                    .toLocalDateTime();
            tuple.addValue(localTo);
            query.append(String.format("WHERE %s < $1 ",getCreatedAtColumn()));
        }
        if(getShareTableName().isPresent()){
            query.append(" GROUP BY t.id ");
        }
        pgPool.queryStream(query.toString(),tuple, getBatchSize()).onSuccess(result -> {
            result.handler(row -> {
                final JsonObject json = PostgresClient.toJson(row);
                if(getShareTableName().isPresent()) {
                    SqlResult.parseSharedFromArray(json);
                }
                stream.add(json);
            }).endHandler(finish -> {
                stream.end();
            }).exceptionHandler(e->{
                log.error("Failed to sqlSelect resources "+getTableName()+ "for reindex : ", e);
            });
        }).onFailure(e->{
            log.error("Failed to create sqlCursor resources "+getTableName()+ "for reindex : ", e);
        });
    }

    @Override
    protected Future<List<String>> doCreate(final UserInfos user, final List<JsonObject> sources, final boolean isCopy) {
        final Map<String, Object> map = new HashMap<>();
        map.put(getCreatorIdColumn(), user.getUserId());
        map.put(getCreatorNameColumn(), user.getUsername());
        setIngestJobState(sources, IngestJobState.TO_BE_SENT);
        final List<String> columnNames = new ArrayList<>(getColumns());
        columnNames.addAll(defaultColumns);
        final String inPlaceholder = PostgresClient.insertPlaceholders(sources, 1, columnNames);
        final Tuple inValues = PostgresClient.insertValuesWithDefault(sources, Tuple.tuple(), map, getMessageFields());
        final String queryTpl = "INSERT INTO %s(%s) VALUES %s returning id";
        final String columns = String.join(",", columnNames);
        final String query = String.format(queryTpl, getTableName(), columns, inPlaceholder);
        return pgPool.preparedQuery(query, inValues).map(result -> {
            final List<String> ids = new ArrayList<>();
            for (final Row row : result) {
                ids.add(row.getInteger(0) + "");
            }
            return ids;
        });
    }

    @Override
    protected Future<List<Boolean>> doDelete(final UserInfos user, final List<String> ids) {
        final Set<Integer> safeIds = ids.stream().map(e->Integer.valueOf(e)).collect(Collectors.toSet());
        final String queryTpl = "DELETE FROM %s WHERE id IN (%s);";
        final String inPlaceholder = PostgresClient.inPlaceholder(ids, 1);
        final String query = String.format(queryTpl, getTableName(), inPlaceholder);
        final Tuple tuple = PostgresClient.inTuple(Tuple.tuple(), safeIds);
        return pgPool.preparedQuery(query, tuple).map(result -> {
            return ids.stream().map(e -> true).collect(Collectors.toList());
        });
    }

    public Future<List<JsonObject>> getByIds(final Set<String> ids) {
        if (ids.isEmpty()) {
            return Future.succeededFuture(new ArrayList<>());
        }
        final Set<Object> idParsed = ids.stream().map(e-> toSqlId(e)).collect(Collectors.toSet());
        final Tuple tuple = PostgresClient.inTuple(Tuple.tuple(), idParsed);
        final String queryTpl = "SELECT * FROM %s  WHERE id IN (%s) ";
        final String inPlaceholder = PostgresClient.inPlaceholder(idParsed, 1);
        final String query = String.format(queryTpl, getTableName(), inPlaceholder);
        return pgPool.preparedQuery(query, tuple).map(rows -> {
            final List<JsonObject> jsons = new ArrayList<>();
            for (final Row row : rows) {
                jsons.add(PostgresClient.toJson(row, rows));
            }
            return jsons;
        });
    }

    //overridable
    protected int getBatchSize() { return 50; }

    protected String getCreatedAtColumn() {
        return "created_at";
    }

    protected String getCreatorIdColumn() {
        return "creator_id";
    }

    protected String getCreatorNameColumn() {
        return "creator_name";
    }

    protected String getIdColumn() {
        return "id";
    }

    protected List<String> getMessageFields() {
        final List<String> columnNames = new ArrayList<>(getColumns());
        columnNames.addAll(defaultColumns);
        return columnNames;
    }

    protected Object toSqlId(final String id) {
        return id;
    }

    protected Optional<String> getShareTableName(){
        return Optional.of(getTableName()+"_shares");
    }
    //abstract
    protected abstract String getTableName();

    protected abstract List<String> getColumns();


    @Override
    public void setIngestJobState(final JsonObject source, final IngestJobState state) {
        super.setIngestJobState(source, state);
    }

    @Override
    public void setIngestJobStateAndVersion(final JsonObject source, final IngestJobState state, long version) {
        super.setIngestJobStateAndVersion(source, state, version);
    }

    @Override
    public void onJobStateUpdatedMessageReceived(final IngestJobStateUpdateMessage message) {
        final String schema = getTableName();
        final String query = new StringBuilder()
            .append(" UPDATE ").append(schema)
            .append(" SET ingest_job_state = $1, version = $2 WHERE id = $3 AND version <= $2")
            .toString();
        final Tuple tuple = Tuple.tuple()
                .addValue(message.getState().name())
                .addValue(message.getVersion())
                .addValue(parseLong(message.getEntityId()));
        pgPool.preparedQuery(query.toString(),tuple).onSuccess(result -> {
            log.debug("Successfully updated state of resource " + message);
        }).onFailure(e->{
            log.error("Failed to update state of resource " + message, e);
        });
    }
}
